package worker

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// errBrowserUnavailable marks failures of the worker itself (Chromium cannot
// start), reported as an ERROR result rather than a failed command.
var errBrowserUnavailable = errors.New("browser unavailable")

type browserCmd struct {
	session string
	timeout time.Duration
	name    string
	args    []string
}

// browserHandler runs one command on a locked session.
type browserHandler func(ctx context.Context, s *browserSession, args []string) (string, error)

// browserCommands is filled by the files that implement each group.
var browserCommands = map[string]browserHandler{}

const browserUsage = `usage: browser [-s <session>] [--timeout <ms>] <command> [args]

Commands (one per call; <t> is a target):
  open <url> (no -s: new session, prints its id) | sessions | close
  back | forward | reload | url | title
  snapshot [-i] [-d <depth>] [-s <selector>]
  click <t> [--double|--right] | dblclick <t> | hover <t> | focus <t> | fill <t> <text> | type <t> <text>
  press <key> | select <t> <value>... | check <t> | uncheck <t> | scroll <up|down|left|right> [px]
  scrollintoview <t> | drag <src> <dst> | mouse move|down|up|wheel ...
  get text|html|value|attr|count|box|title|url ... | is visible|enabled|checked <t>
  find role <role> [--name <n>] [action [value]] | find text|label|placeholder|alt|title|testid <v> [action [value]]
  wait <t> | wait <ms> | wait --text <s> | wait --url <substr> | wait --load [load|idle] | wait --fn <js>
  eval <js>
  tab list | tab new [url] | tab <n> | tab close [n] | frame <t> | frame main
  dialog accept [text] | dialog dismiss | dialog status
  cookies [set <name> <value> [--domain d] [--path p] | clear] | storage local|session [get <k> | set <k> <v> | clear]
  requests [--filter <s>] [--clear] | set headers <json> | set credentials <user> <pass> | set offline on|off
  set viewport <w> <h> | set useragent <ua> | set media dark|light | set geo <lat> <lng>
  console [--clear] | errors [--clear]

<t> is a ref from the last snapshot (@e3), a CSS selector, xpath=<expr> or text=<substring>.`

// argToken is one parsed argument. bare is the argument as typed outside
// quotes and escapes, with each quoted or escaped byte replaced by \x00, so
// syntax checks can tell `;` from `";"`.
type argToken struct{ val, bare string }

// tokenize splits a command line like a POSIX shell, without expansion:
// '...' is literal, "..." honours \" and \\, a backslash escapes outside quotes.
func tokenize(s string) ([]argToken, error) {
	var toks []argToken
	var val, bare strings.Builder
	inArg := false
	quoted := func(b string) {
		val.WriteString(b)
		bare.WriteString(strings.Repeat("\x00", len(b)))
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == ' ' || c == '\t' || c == '\n':
			if inArg {
				toks = append(toks, argToken{val.String(), bare.String()})
				val.Reset()
				bare.Reset()
				inArg = false
			}
		case c == '\'':
			end := strings.IndexByte(s[i+1:], '\'')
			if end < 0 {
				return nil, errors.New("unterminated quote")
			}
			quoted(s[i+1 : i+1+end])
			i += end + 1
			inArg = true
		case c == '"':
			i++
			for ; i < len(s) && s[i] != '"'; i++ {
				if s[i] == '\\' && i+1 < len(s) && (s[i+1] == '"' || s[i+1] == '\\') {
					i++
				}
				quoted(s[i : i+1])
			}
			if i >= len(s) {
				return nil, errors.New("unterminated quote")
			}
			inArg = true
		case c == '\\' && i+1 < len(s):
			i++
			quoted(s[i : i+1])
			inArg = true
		default:
			val.WriteByte(c)
			bare.WriteByte(c)
			inArg = true
		}
	}
	if inArg {
		toks = append(toks, argToken{val.String(), bare.String()})
	}
	return toks, nil
}

// chainOperator returns the shell operator an argument carries unquoted:
// the agent meant to chain commands, which no shell runs here. A lone `|`
// inside a token is left alone (xpath unions use it).
func chainOperator(t argToken) string {
	switch {
	case t.bare == ";" || t.bare == "&&" || t.bare == "||" || t.bare == "|":
		return t.bare
	case strings.HasSuffix(t.bare, ";"):
		return ";"
	case strings.Contains(t.bare, "&&"):
		return "&&"
	case strings.Contains(t.bare, "||"):
		return "||"
	}
	return ""
}

var browserSessionIDPattern = regexp.MustCompile(`^b-[0-9a-f]{32}$`)

// parseBrowserCmd reads the global flags. They belong before the command
// name, but agents also put them after it. There a flag counts only when
// unquoted, and -s only with a b-<id> value ("snapshot -s" takes a selector).
func parseBrowserCmd(toks []argToken) (browserCmd, error) {
	c := browserCmd{timeout: browserCmdTimeout}
	i := 0
	for ; i < len(toks) && strings.HasPrefix(toks[i].val, "-"); i += 2 {
		if i+1 >= len(toks) {
			return c, fmt.Errorf("%s needs a value", toks[i].val)
		}
		if err := c.setFlag(toks[i].val, toks[i+1].val); err != nil {
			return c, err
		}
	}
	if i == len(toks) {
		return c, nil
	}
	c.name = toks[i].val
	for i++; i < len(toks); i++ {
		t := toks[i]
		if t.bare == t.val && i+1 < len(toks) && c.isTrailingFlag(t.val, toks[i+1].val) {
			if err := c.setFlag(t.val, toks[i+1].val); err != nil {
				return c, err
			}
			i++
			continue
		}
		c.args = append(c.args, t.val)
	}
	return c, nil
}

func (c *browserCmd) setFlag(flag, value string) error {
	switch flag {
	case "-s", "--session":
		c.session = value
	case "--timeout":
		ms, err := strconv.Atoi(value)
		if err != nil || ms <= 0 || ms > 55000 {
			return errors.New("--timeout must be 1..55000 ms (core stops waiting at 60s)")
		}
		c.timeout = time.Duration(ms) * time.Millisecond
	default:
		return fmt.Errorf("unknown flag %s", flag)
	}
	return nil
}

// isTrailingFlag reports whether flag, seen after the command name, is a
// global flag rather than an argument of the command.
func (c *browserCmd) isTrailingFlag(flag, value string) bool {
	switch flag {
	case "--timeout":
		return true
	case "-s", "--session":
		return c.session == "" && browserSessionIDPattern.MatchString(value)
	}
	return false
}

// browserWedgeGrace is how long a command may overrun its timeout before its
// session is shut down. rod's mouse and keyboard calls ignore the command's
// ctx, so a page that stops answering would otherwise hold the session, and a
// remote exec slot, forever.
const browserWedgeGrace = 3 * time.Second

// runHandler runs h, recovering a panic into an error. If h outlives ctx by
// browserWedgeGrace, the session is shut down, which aborts every CDP call
// pending on its pages; wedged then reports that.
func runHandler(ctx context.Context, h browserHandler, s *browserSession, args []string) (out string, wedged bool, err error) {
	type result struct {
		out string
		err error
	}
	res := make(chan result, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				res <- result{err: fmt.Errorf("internal error: %v", r)}
			}
		}()
		out, err := h(ctx, s, args)
		res <- result{out, err}
	}()
	select {
	case r := <-res:
		return r.out, false, r.err
	case <-ctx.Done():
	}
	select {
	case r := <-res:
		return r.out, false, r.err
	case <-time.After(browserWedgeGrace):
	}
	s.shutdown()
	select {
	case r := <-res:
		return r.out, true, r.err
	case <-time.After(browserWedgeGrace):
		// Still stuck; the session is closed, so nothing else will use it.
		return "", true, ctx.Err()
	}
}

// browserResult is what one browser command gives the agent.
type browserResult struct {
	out    string
	failed bool   // exit code 1
	shot   []byte // JPEG of the session's page after the command; nil if none
}

// run executes one browser command line (the text after "browser "). out is
// what the agent reads; failed sets exit code 1; err is a worker failure.
func (a *agentBrowsers) run(ctx context.Context, line string) (out string, failed bool, err error) {
	r, err := a.runWithScreenshot(ctx, line)
	return r.out, r.failed, err
}

// runWithScreenshot is run, plus a screenshot of the session's page once a
// command has run in a session that is still open.
func (a *agentBrowsers) runWithScreenshot(ctx context.Context, line string) (browserResult, error) {
	toks, err := tokenize(line)
	if err != nil {
		return browserResult{out: "error: " + err.Error(), failed: true}, nil
	}
	// No shell runs these, so a chained command would arrive as stray args.
	for _, t := range toks {
		if op := chainOperator(t); op != "" {
			return browserResult{out: fmt.Sprintf("error: an unquoted %q would chain commands, but no shell runs here; send one browser command per call (quote it if it is part of a value)", op), failed: true}, nil
		}
	}
	c, err := parseBrowserCmd(toks)
	if err != nil {
		return browserResult{out: "error: " + err.Error() + "\n\n" + browserUsage, failed: true}, nil
	}
	switch {
	case c.name == "" || c.name == "help":
		return browserResult{out: browserUsage, failed: c.name == ""}, nil
	case c.name == "sessions":
		// Never the ids: on a shared worker they would hand one conversation's
		// session to another.
		return browserResult{out: fmt.Sprintf("%d browser session(s) open on this worker; ids are shown only by the \"browser open\" that created them", a.count())}, nil
	case browserCommands[c.name] == nil:
		return browserResult{out: fmt.Sprintf("error: unknown command %q%s\n\n%s", c.name, unknownCmdHint(c), browserUsage), failed: true}, nil
	case c.name == "open" && len(c.args) > 1:
		return browserResult{out: fmt.Sprintf("error: open takes one url, got %q; quote a url with spaces", c.args), failed: true}, nil
	}

	parent := ctx // the screenshot gets its own time, after the command's
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	var s *browserSession
	var done func()
	prefix := ""
	if c.session == "" {
		if c.name != "open" || len(c.args) == 0 {
			return browserResult{out: `error: -s <session> is required; start one with "browser open <url>"`, failed: true}, nil
		}
		target, perr := url.Parse(formatURL(c.args[0]))
		if perr != nil || target.Hostname() == "" {
			return browserResult{out: fmt.Sprintf("error: invalid url %q", c.args[0]), failed: true}, nil
		}
		if a.publicOnly {
			if herr := sharedWorkerHostErr(target.Hostname()); herr != nil {
				return browserResult{out: "error: " + herr.Error(), failed: true}, nil
			}
		}
		s, done, err = a.open(ctx)
		if errors.Is(err, errBrowserUnavailable) {
			return browserResult{}, err
		}
	} else {
		s, done, err = a.acquire(c.session)
	}
	if err != nil {
		return browserResult{out: "error: " + err.Error(), failed: true}, nil
	}
	defer done()
	if c.session == "" {
		prefix = "session: " + s.id + "\n"
	}

	out, wedged, err := runHandler(ctx, browserCommands[c.name], s, c.args)
	out = prefix + out
	if blocked := s.drainBlocked(); len(blocked) > 0 {
		out += fmt.Sprintf("\n\nblocked (this worker is shared, so it reaches only public addresses):\n%s", strings.Join(blocked, "\n"))
	}
	if wedged {
		return browserResult{out: strings.TrimLeft(out+fmt.Sprintf("\nerror: timed out after %s and the page stopped responding, so browser session %s was closed; run \"browser open <url>\" again", c.timeout, s.id), "\n"), failed: true}, nil
	}
	r := browserResult{out: out, shot: s.screenshot(parent)}
	if err != nil {
		msg := trimRodStack(err.Error())
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			msg = fmt.Sprintf("timed out after %s (%s)", c.timeout, msg)
		}
		r.out, r.failed = strings.TrimLeft(out+"\nerror: "+msg, "\n"), true
	}
	return r, nil
}

// unknownCmdHint corrects the slips agents make: a bare URL, or a word in
// front of a real command.
func unknownCmdHint(c browserCmd) string {
	switch {
	case strings.Contains(c.name, "."):
		return fmt.Sprintf("; to load a page run \"browser open %s\"", c.name)
	case len(c.args) > 0 && strings.Contains(c.args[0], "."):
		return fmt.Sprintf("; to load a page run \"browser open %s\"", c.args[0])
	case len(c.args) > 0 && browserCommands[c.args[0]] != nil:
		return fmt.Sprintf("; %q is a command, drop %q", c.args[0], c.name)
	}
	return ""
}

// loggableCommand drops a browser command's arguments, which may hold
// credentials (fill, set credentials), before it reaches logs or the TUI.
func loggableCommand(command string) string {
	rest, ok := strings.CutPrefix(command, "browser ")
	if !ok {
		return command
	}
	toks, _ := tokenize(rest)
	c, _ := parseBrowserCmd(toks)
	return strings.TrimSpace("browser " + c.name)
}

// argN returns args[i] or an error naming what is missing.
func argN(args []string, i int, what string) (string, error) {
	if i >= len(args) {
		return "", fmt.Errorf("missing %s", what)
	}
	return args[i], nil
}
