package worker

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"strconv"
	"strings"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"github.com/ysmood/gson"
)

func init() {
	browserCommands["tab"] = browserTab
	browserCommands["frame"] = browserFrame
	browserCommands["dialog"] = browserDialog
	browserCommands["cookies"] = browserCookies
	browserCommands["storage"] = browserStorage
	browserCommands["requests"] = logCommand(func(s *browserSession) *ringLog { return &s.requests })
	browserCommands["console"] = logCommand(func(s *browserSession) *ringLog { return &s.console })
	browserCommands["errors"] = logCommand(func(s *browserSession) *ringLog { return &s.errs })
	browserCommands["set"] = browserSet
}

func browserTab(ctx context.Context, s *browserSession, args []string) (string, error) {
	sub := "list"
	if len(args) > 0 {
		sub = args[0]
	}
	switch sub {
	case "list":
		s.stateMu.Lock()
		pages, active := append(s.pages[:0:0], s.pages...), s.active
		s.stateMu.Unlock()
		var b strings.Builder
		for i, p := range pages {
			mark := " "
			if i == active {
				mark = "*"
			}
			info, err := p.Context(ctx).Info()
			if err != nil {
				fmt.Fprintf(&b, "%s %d (unavailable)\n", mark, i)
				continue
			}
			fmt.Fprintf(&b, "%s %d %s — %s\n", mark, i, info.Title, info.URL)
		}
		if b.Len() == 0 {
			return "no tabs", nil
		}
		return strings.TrimRight(b.String(), "\n"), nil
	case "new":
		if _, err := s.newTab(ctx); err != nil {
			return "", err
		}
		if len(args) > 1 {
			return browserOpen(ctx, s, args[1:])
		}
		return "opened tab " + strconv.Itoa(s.activeIndex()), nil
	case "close":
		i := s.activeIndex()
		if len(args) > 1 {
			n, err := strconv.Atoi(args[1])
			if err != nil {
				return "", fmt.Errorf("invalid tab %q", args[1])
			}
			i = n
		}
		p, err := s.tabAt(i)
		if err != nil {
			return "", err
		}
		// Target.closeTarget, not rod's Page.Close: that one runs beforeunload
		// (a dismissed dialog cancels the close yet it reports success) and
		// waits on it without a deadline, holding rod's browser-wide target
		// lock.
		if _, err := (proto.TargetCloseTarget{TargetID: p.TargetID}).Call(s.ctx.Context(ctx)); err != nil {
			return "", err
		}
		s.forget(p.TargetID)
		s.ctx.RemoveState(p.TargetID) // rod's page cache entry
		return fmt.Sprintf("closed tab %d", i), nil
	}
	n, err := strconv.Atoi(sub)
	if err != nil {
		return "", fmt.Errorf("unknown tab command %q", sub)
	}
	p, err := s.tabAt(n)
	if err != nil {
		return "", err
	}
	if _, err := p.Context(ctx).Activate(); err != nil {
		return "", err
	}
	s.stateMu.Lock()
	s.active, s.frame = n, nil
	s.stateMu.Unlock()
	i, err := summarize(ctx, s)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("tab %d: %s", n, i), nil
}

func (s *browserSession) activeIndex() int {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	return s.active
}

func (s *browserSession) tabAt(i int) (*rod.Page, error) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	if i < 0 || i >= len(s.pages) {
		return nil, fmt.Errorf("no tab %d (have %d)", i, len(s.pages))
	}
	return s.pages[i], nil
}

// browserFrame scopes later commands to an iframe, or back to the tab.
func browserFrame(ctx context.Context, s *browserSession, args []string) (string, error) {
	t, err := argN(args, 0, `iframe target or "main"`)
	if err != nil {
		return "", err
	}
	if t == "main" {
		s.leaveFrame()
		return "in main frame", nil
	}
	el, err := s.target(ctx, t)
	if err != nil {
		return "", err
	}
	// The frame page outlives this command, and rod resolves its JS context
	// through the iframe element, so neither may keep this command's ctx.
	f, err := el.Context(s.sessCtx).Frame()
	if err != nil {
		return "", fmt.Errorf("%s is not an iframe: %w", t, err)
	}
	s.stateMu.Lock()
	s.frame = f.Context(s.sessCtx)
	s.stateMu.Unlock()
	return "in frame " + t + ` (run "snapshot" for its refs)`, nil
}

func browserDialog(_ context.Context, s *browserSession, args []string) (string, error) {
	sub, err := argN(args, 0, "accept, dismiss or status")
	if err != nil {
		return "", err
	}
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	switch sub {
	case "accept":
		s.dialogAccept, s.dialogText = true, strings.Join(args[1:], " ")
	case "dismiss":
		s.dialogAccept, s.dialogText = false, ""
	case "status":
	default:
		return "", fmt.Errorf("unknown dialog command %q", sub)
	}
	policy := "dismiss (alerts are accepted)"
	if s.dialogAccept {
		policy = "accept"
		if s.dialogText != "" {
			policy += " with prompt text " + strconv.Quote(s.dialogText)
		}
	}
	return "dialogs: " + policy + `; handled dialogs appear in "console"`, nil
}

func browserCookies(ctx context.Context, s *browserSession, args []string) (string, error) {
	page, err := s.page()
	if err != nil {
		return "", err
	}
	p := page.Context(ctx)
	sub := ""
	if len(args) > 0 {
		sub = args[0]
	}
	switch sub {
	case "":
		cookies, err := p.Cookies(nil)
		if err != nil {
			return "", err
		}
		if len(cookies) == 0 {
			return "no cookies", nil
		}
		var b strings.Builder
		for _, c := range cookies {
			fmt.Fprintf(&b, "%s=%s; domain=%s; path=%s", c.Name, c.Value, c.Domain, c.Path)
			if c.HTTPOnly {
				b.WriteString("; httpOnly")
			}
			if c.Secure {
				b.WriteString("; secure")
			}
			if c.SameSite != "" {
				b.WriteString("; sameSite=" + string(c.SameSite))
			}
			b.WriteByte('\n')
		}
		return strings.TrimRight(b.String(), "\n"), nil
	case "set":
		if len(args) < 3 {
			return "", errors.New("usage: cookies set <name> <value> [--domain d] [--path p]")
		}
		c := &proto.NetworkCookieParam{Name: args[1], Value: args[2]}
		for i := 3; i+1 < len(args); i += 2 {
			switch args[i] {
			case "--domain":
				c.Domain = args[i+1]
			case "--path":
				c.Path = args[i+1]
			default:
				return "", fmt.Errorf("unknown cookie option %q", args[i])
			}
		}
		if c.Domain == "" {
			info, err := p.Info()
			if err != nil {
				return "", err
			}
			c.URL = info.URL
		}
		return "cookie " + args[1] + " set", p.SetCookies([]*proto.NetworkCookieParam{c})
	case "clear":
		// Scoped to this session's context; Network.clearBrowserCookies is not.
		return "cookies cleared", proto.StorageClearCookies{BrowserContextID: s.ctx.BrowserContextID}.Call(s.ctx)
	}
	return "", fmt.Errorf("unknown cookies command %q", sub)
}

func browserStorage(ctx context.Context, s *browserSession, args []string) (string, error) {
	area, err := argN(args, 0, "local or session")
	if err != nil {
		return "", err
	}
	if area != "local" && area != "session" {
		return "", fmt.Errorf("storage area must be local or session, got %q", area)
	}
	page, err := s.page()
	if err != nil {
		return "", err
	}
	p := page.Context(ctx)
	store := area + "Storage"
	sub := ""
	if len(args) > 1 {
		sub = args[1]
	}
	switch sub {
	case "":
		res, err := p.Eval(`(s) => JSON.stringify(Object.fromEntries(Object.entries(window[s])))`, store)
		if err != nil {
			return "", err
		}
		return res.Value.Str(), nil
	case "get":
		k, err := argN(args, 2, "key")
		if err != nil {
			return "", err
		}
		res, err := p.Eval(`(s, k) => window[s].getItem(k)`, store, k)
		if err != nil {
			return "", err
		}
		if res.Value.Nil() {
			return "", fmt.Errorf("no %s key %q", store, k)
		}
		return res.Value.Str(), nil
	case "set":
		if len(args) < 4 {
			return "", errors.New("usage: storage local|session set <key> <value>")
		}
		_, err := p.Eval(`(s, k, v) => window[s].setItem(k, v)`, store, args[2], args[3])
		return store + " " + args[2] + " set", err
	case "clear":
		_, err := p.Eval(`(s) => window[s].clear()`, store)
		return store + " cleared", err
	}
	return "", fmt.Errorf("unknown storage command %q", sub)
}

func logCommand(pick func(*browserSession) *ringLog) browserHandler {
	return func(_ context.Context, s *browserSession, args []string) (string, error) {
		log := pick(s)
		filter := ""
		for i := 0; i < len(args); i++ {
			switch args[i] {
			case "--clear":
				log.clear()
				return "cleared", nil
			case "--filter":
				v, err := argN(args, i+1, "filter")
				if err != nil {
					return "", err
				}
				filter = v
				i++
			default:
				return "", fmt.Errorf("unknown option %q", args[i])
			}
		}
		lines := log.list(filter)
		if len(lines) == 0 {
			return "(empty)", nil
		}
		return strings.Join(lines, "\n"), nil
	}
}

func browserSet(ctx context.Context, s *browserSession, args []string) (string, error) {
	what, err := argN(args, 0, "setting")
	if err != nil {
		return "", err
	}
	page, err := s.page()
	if err != nil {
		return "", err
	}
	p := page.Context(ctx)
	switch what {
	case "viewport":
		if len(args) < 3 {
			return "", errors.New("usage: set viewport <width> <height>")
		}
		w, werr := strconv.Atoi(args[1])
		h, herr := strconv.Atoi(args[2])
		if werr != nil || herr != nil || w <= 0 || h <= 0 {
			return "", errors.New("viewport width and height must be positive integers")
		}
		return fmt.Sprintf("viewport %dx%d", w, h), p.SetViewport(&proto.EmulationSetDeviceMetricsOverride{Width: w, Height: h, DeviceScaleFactor: 1})
	case "useragent":
		ua := strings.Join(args[1:], " ")
		if ua == "" {
			return "", errors.New("missing user agent")
		}
		return "user agent set", p.SetUserAgent(&proto.NetworkSetUserAgentOverride{UserAgent: ua})
	case "media":
		scheme, err := argN(args, 1, "dark or light")
		if err != nil {
			return "", err
		}
		if scheme != "dark" && scheme != "light" {
			return "", fmt.Errorf("media must be dark or light, got %q", scheme)
		}
		return "prefers-color-scheme: " + scheme, proto.EmulationSetEmulatedMedia{Features: []*proto.EmulationMediaFeature{{Name: "prefers-color-scheme", Value: scheme}}}.Call(p)
	case "geo":
		if len(args) < 3 {
			return "", errors.New("usage: set geo <latitude> <longitude>")
		}
		lat, aerr := strconv.ParseFloat(args[1], 64)
		lng, oerr := strconv.ParseFloat(args[2], 64)
		if aerr != nil || oerr != nil {
			return "", errors.New("latitude and longitude must be numbers")
		}
		acc := 10.0
		if err := (proto.BrowserGrantPermissions{Permissions: []proto.BrowserPermissionType{proto.BrowserPermissionTypeGeolocation}, BrowserContextID: s.ctx.BrowserContextID}).Call(s.ctx); err != nil {
			return "", err
		}
		return fmt.Sprintf("geolocation %g,%g", lat, lng), proto.EmulationSetGeolocationOverride{Latitude: &lat, Longitude: &lng, Accuracy: &acc}.Call(p)
	case "offline":
		v, err := argN(args, 1, "on or off")
		if err != nil {
			return "", err
		}
		off := v == "on"
		if !off && v != "off" {
			return "", fmt.Errorf("offline must be on or off, got %q", v)
		}
		return "offline " + v, proto.NetworkEmulateNetworkConditions{Offline: off, DownloadThroughput: -1, UploadThroughput: -1}.Call(p)
	case "headers":
		raw, err := argN(args, 1, `headers as JSON, e.g. '{"X-Test":"1"}'`)
		if err != nil {
			return "", err
		}
		var h map[string]string
		if err := json.Unmarshal([]byte(raw), &h); err != nil {
			return "", fmt.Errorf("headers must be a JSON object of strings: %w", err)
		}
		if h == nil { // "null"
			h = map[string]string{}
		}
		s.stateMu.Lock()
		if auth := s.headers["Authorization"]; auth != "" {
			if _, ok := h["Authorization"]; !ok {
				h["Authorization"] = auth
			}
		}
		s.stateMu.Unlock()
		return "extra headers set on this session's tabs", s.applyHeaders(h)
	case "credentials":
		if len(args) < 3 {
			return "", errors.New("usage: set credentials <user> <password>")
		}
		s.stateMu.Lock()
		h := maps.Clone(s.headers)
		s.stateMu.Unlock()
		if h == nil {
			h = map[string]string{}
		}
		h["Authorization"] = "Basic " + base64.StdEncoding.EncodeToString([]byte(args[1]+":"+args[2]))
		return "basic auth set on this session's tabs", s.applyHeaders(h)
	}
	return "", fmt.Errorf("unknown setting %q", what)
}

// applyHeaders makes headers the session's extra headers and sends them with
// every tab's requests; tabs opened later get them in adopt.
func (s *browserSession) applyHeaders(headers map[string]string) error {
	s.stateMu.Lock()
	s.headers = headers
	pages := append(s.pages[:0:0], s.pages...)
	s.stateMu.Unlock()
	for _, p := range pages {
		if err := applyHeadersTo(p, headers); err != nil {
			return err
		}
	}
	return nil
}

func applyHeadersTo(p *rod.Page, headers map[string]string) error {
	h := make(proto.NetworkHeaders, len(headers))
	for k, v := range headers {
		h[k] = gson.New(v)
	}
	return proto.NetworkSetExtraHTTPHeaders{Headers: h}.Call(p)
}
