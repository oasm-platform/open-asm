package worker

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// errBrowserUnavailable marks failures of the worker itself (Chromium cannot
// start), reported as an ERROR result rather than a failed command.
var errBrowserUnavailable = errors.New("browser unavailable")

type browserCmd struct {
	session string
	allow   []string
	timeout time.Duration
	name    string
	args    []string
}

// browserHandler runs one command on a locked session.
type browserHandler func(ctx context.Context, s *browserSession, args []string) (string, error)

// browserCommands is filled by the files that implement each group.
var browserCommands = map[string]browserHandler{}

const browserUsage = `usage: browser [-s <session>] [--allow <host>]... [--timeout <ms>] <command> [args]

Commands (one per call; <t> is a target):
  open <url> (no -s: new session, prints its id) | sessions | close | allow <host>...
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

// splitArgs splits a command line like a POSIX shell, without expansion:
// '...' is literal, "..." honours \" and \\, a backslash escapes outside quotes.
func splitArgs(s string) ([]string, error) {
	var args []string
	var cur strings.Builder
	inArg := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == ' ' || c == '\t' || c == '\n':
			if inArg {
				args = append(args, cur.String())
				cur.Reset()
				inArg = false
			}
		case c == '\'':
			end := strings.IndexByte(s[i+1:], '\'')
			if end < 0 {
				return nil, errors.New("unterminated quote")
			}
			cur.WriteString(s[i+1 : i+1+end])
			i += end + 1
			inArg = true
		case c == '"':
			i++
			for ; i < len(s) && s[i] != '"'; i++ {
				if s[i] == '\\' && i+1 < len(s) && (s[i+1] == '"' || s[i+1] == '\\') {
					i++
				}
				cur.WriteByte(s[i])
			}
			if i >= len(s) {
				return nil, errors.New("unterminated quote")
			}
			inArg = true
		case c == '\\' && i+1 < len(s):
			i++
			cur.WriteByte(s[i])
			inArg = true
		default:
			cur.WriteByte(c)
			inArg = true
		}
	}
	if inArg {
		args = append(args, cur.String())
	}
	return args, nil
}

// parseBrowserCmd reads the global flags, which come before the command name.
func parseBrowserCmd(args []string) (browserCmd, error) {
	c := browserCmd{timeout: browserCmdTimeout}
	for len(args) > 0 && strings.HasPrefix(args[0], "-") {
		if len(args) < 2 {
			return c, fmt.Errorf("%s needs a value", args[0])
		}
		switch args[0] {
		case "-s", "--session":
			c.session = args[1]
		case "--allow":
			c.allow = append(c.allow, args[1])
		case "--timeout":
			ms, err := strconv.Atoi(args[1])
			if err != nil || ms <= 0 || ms > 55000 {
				return c, errors.New("--timeout must be 1..55000 ms (core stops waiting at 60s)")
			}
			c.timeout = time.Duration(ms) * time.Millisecond
		default:
			return c, fmt.Errorf("unknown flag %s", args[0])
		}
		args = args[2:]
	}
	if len(args) > 0 {
		c.name, c.args = args[0], args[1:]
	}
	return c, nil
}

// run executes one browser command line (the text after "browser "). out is
// what the agent reads; failed sets exit code 1; err is a worker failure.
func (a *agentBrowsers) run(ctx context.Context, line string) (out string, failed bool, err error) {
	args, err := splitArgs(line)
	if err != nil {
		return "error: " + err.Error(), true, nil
	}
	c, err := parseBrowserCmd(args)
	if err != nil {
		return "error: " + err.Error() + "\n\n" + browserUsage, true, nil
	}
	// No shell runs these, so a chained command would arrive as stray args.
	for _, arg := range args {
		if arg == "&&" || arg == "||" || arg == ";" || arg == "|" {
			return fmt.Sprintf("error: %q does not chain commands here; send one browser command per call", arg), true, nil
		}
	}
	switch {
	case c.name == "" || c.name == "help":
		return browserUsage, c.name == "", nil
	case c.name == "sessions":
		ids := a.list()
		if len(ids) == 0 {
			return "no browser sessions", false, nil
		}
		return strings.Join(ids, "\n"), false, nil
	case browserCommands[c.name] == nil:
		return fmt.Sprintf("error: unknown command %q%s\n\n%s", c.name, unknownCmdHint(c), browserUsage), true, nil
	case len(c.allow) > 0 && (c.name != "open" || c.session != ""):
		return `error: --allow only applies when "open" creates a session; use "allow <host>" on an existing one`, true, nil
	}

	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	var s *browserSession
	var done func()
	prefix := ""
	if c.session == "" {
		if c.name != "open" || len(c.args) == 0 {
			return `error: -s <session> is required; start one with "browser open <url>"`, true, nil
		}
		target, perr := url.Parse(formatURL(c.args[0]))
		if perr != nil || target.Hostname() == "" {
			return fmt.Sprintf("error: invalid url %q", c.args[0]), true, nil
		}
		s, done, err = a.open(append(c.allow, target.Hostname()))
		if errors.Is(err, errBrowserUnavailable) {
			return "", false, err
		}
	} else {
		s, done, err = a.acquire(c.session)
	}
	if err != nil {
		return "error: " + err.Error(), true, nil
	}
	defer done()
	if c.session == "" {
		prefix = "session: " + s.id + "\n"
	}

	out, err = browserCommands[c.name](ctx, s, c.args)
	out = prefix + out
	if blocked := s.drainBlocked(); len(blocked) > 0 {
		out += fmt.Sprintf("\n\nblocked (out of scope, add with \"allow <host>\"):\n%s", strings.Join(blocked, "\n"))
	}
	if err != nil {
		msg := trimRodStack(err.Error())
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			msg = fmt.Sprintf("timed out after %s (%s)", c.timeout, msg)
		}
		return strings.TrimLeft(out+"\nerror: "+msg, "\n"), true, nil
	}
	return out, false, nil
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

// argN returns args[i] or an error naming what is missing.
func argN(args []string, i int, what string) (string, error) {
	if i >= len(args) {
		return "", fmt.Errorf("missing %s", what)
	}
	return args[i], nil
}
