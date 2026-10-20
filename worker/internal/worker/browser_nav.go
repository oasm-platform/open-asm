package worker

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
)

func init() {
	browserCommands["open"] = browserOpen
	browserCommands["back"] = func(ctx context.Context, s *browserSession, _ []string) (string, error) {
		return navigateAndDescribe(ctx, s, historyStep(-1))
	}
	browserCommands["forward"] = func(ctx context.Context, s *browserSession, _ []string) (string, error) {
		return navigateAndDescribe(ctx, s, historyStep(1))
	}
	browserCommands["reload"] = func(ctx context.Context, s *browserSession, _ []string) (string, error) {
		return navigateAndDescribe(ctx, s, func(p *rod.Page) error { return proto.PageReload{}.Call(p) })
	}
	browserCommands["url"] = pageInfo(func(i pageSummary) string { return i.url })
	browserCommands["title"] = pageInfo(func(i pageSummary) string { return i.title })
	browserCommands["close"] = func(_ context.Context, s *browserSession, _ []string) (string, error) {
		s.shutdown()
		return "closed session " + s.id, nil
	}
	browserCommands["allow"] = func(_ context.Context, s *browserSession, args []string) (string, error) {
		if len(args) == 0 {
			return "", fmt.Errorf("missing host")
		}
		s.proxy.allowHosts(args...)
		return "scope: " + strings.Join(s.proxy.scope(), ", "), nil
	}
}

type pageSummary struct{ title, url string }

// summarize describes the page commands act on. It reads the main frame's
// tab info when inside an iframe so the agent still sees where it is.
func summarize(ctx context.Context, s *browserSession) (pageSummary, error) {
	p, err := s.page()
	if err != nil {
		return pageSummary{}, err
	}
	info, err := p.Context(ctx).Info()
	if err != nil {
		return pageSummary{}, err
	}
	return pageSummary{title: info.Title, url: info.URL}, nil
}

func pageInfo(pick func(pageSummary) string) browserHandler {
	return func(ctx context.Context, s *browserSession, _ []string) (string, error) {
		i, err := summarize(ctx, s)
		if err != nil {
			return "", err
		}
		return pick(i), nil
	}
}

func (i pageSummary) String() string { return i.title + " — " + i.url }

// browserOpen navigates the active tab (opening one if none) to an in-scope
// URL and prints where it landed plus the interactive snapshot.
func browserOpen(ctx context.Context, s *browserSession, args []string) (string, error) {
	raw, err := argN(args, 0, "url")
	if err != nil {
		return "", err
	}
	target := formatURL(raw)
	u, err := url.Parse(target)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
		return "", fmt.Errorf("only http(s) URLs can be opened, got %q", raw)
	}
	if !s.proxy.allowed(u.Host) {
		return "", fmt.Errorf("%s is not in this session's scope (%s); extend it with \"allow %s\"", u.Hostname(), strings.Join(s.proxy.scope(), ", "), u.Hostname())
	}
	if _, err := s.page(); err != nil {
		if _, err := s.newTab(ctx); err != nil {
			return "", err
		}
	}
	return navigateAndDescribe(ctx, s, func(p *rod.Page) error { return p.Navigate(target) })
}

// navigateAndDescribe runs a navigation on the active tab, waits for the load
// and reports the result with an interactive snapshot.
func navigateAndDescribe(ctx context.Context, s *browserSession, nav func(*rod.Page) error) (string, error) {
	s.leaveFrame()
	p, err := s.page()
	if err != nil {
		return "", err
	}
	p = p.Context(ctx)
	// FrameNavigated also fires for back/forward cache restores, which send
	// no load lifecycle event.
	wait := p.EachEvent(func(e *proto.PageFrameNavigated) bool { return e.Frame.ParentID == "" })
	if err := nav(p); err != nil {
		return "", err
	}
	wait()
	if err := p.WaitLoad(); err != nil {
		return "", err
	}
	i, err := summarize(ctx, s)
	if err != nil {
		return "", err
	}
	return describeWithSnapshot(ctx, s, i.String())
}

// historyStep moves through the tab's history, refusing to go past either end
// (history.back() there would leave the command waiting for a navigation).
func historyStep(delta int) func(*rod.Page) error {
	return func(p *rod.Page) error {
		h, err := p.GetNavigationHistory()
		if err != nil {
			return err
		}
		i := h.CurrentIndex + delta
		if i < 0 || i >= len(h.Entries) {
			return errors.New("no history entry in that direction")
		}
		return proto.PageNavigateToHistoryEntry{EntryID: h.Entries[i].ID}.Call(p)
	}
}

// leaveFrame returns the session to the active tab's main frame.
func (s *browserSession) leaveFrame() {
	s.stateMu.Lock()
	s.frame = nil
	s.stateMu.Unlock()
}

// describeWithSnapshot follows a page header with the interactive snapshot.
func describeWithSnapshot(_ context.Context, _ *browserSession, header string) (string, error) {
	return header, nil
}
