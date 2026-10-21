package worker

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/input"
	"github.com/go-rod/rod/lib/proto"
)

// elementOp acts on a resolved element; args are what follows the target.
type elementOp func(ctx context.Context, s *browserSession, el *rod.Element, args []string) (string, error)

// elementOps are shared by the plain commands ("click <t>") and "find".
var elementOps = map[string]elementOp{
	"click": func(_ context.Context, _ *browserSession, el *rod.Element, args []string) (string, error) {
		button, count := proto.InputMouseButtonLeft, 1
		for _, a := range args {
			switch a {
			case "--double":
				count = 2
			case "--right":
				button = proto.InputMouseButtonRight
			default:
				return "", fmt.Errorf("unknown click option %q", a)
			}
		}
		return "clicked", el.Click(button, count)
	},
	"dblclick": func(_ context.Context, _ *browserSession, el *rod.Element, _ []string) (string, error) {
		return "double-clicked", el.Click(proto.InputMouseButtonLeft, 2)
	},
	"hover": func(_ context.Context, _ *browserSession, el *rod.Element, _ []string) (string, error) {
		return "hovered", el.Hover()
	},
	"focus": func(_ context.Context, _ *browserSession, el *rod.Element, _ []string) (string, error) {
		return "focused", el.Focus()
	},
	"fill": func(_ context.Context, _ *browserSession, el *rod.Element, args []string) (string, error) {
		text, err := argN(args, 0, "text")
		if err != nil {
			return "", err
		}
		if err := el.SelectAllText(); err != nil {
			return "", err
		}
		return "filled", el.Input(text)
	},
	"type": func(ctx context.Context, s *browserSession, el *rod.Element, args []string) (string, error) {
		text, err := argN(args, 0, "text")
		if err != nil {
			return "", err
		}
		if err := el.Focus(); err != nil {
			return "", err
		}
		// Caret to the end so typing appends, as after a user's click.
		_, _ = el.Eval(`function () { if (typeof this.setSelectionRange === 'function') { try { const n = this.value.length; this.setSelectionRange(n, n) } catch (e) {} } }`)
		page, err := s.page()
		if err != nil {
			return "", err
		}
		return "typed", typeText(page.Context(ctx), text)
	},
	"select": func(_ context.Context, _ *browserSession, el *rod.Element, args []string) (string, error) {
		if len(args) == 0 {
			return "", errors.New("missing value")
		}
		res, err := el.Eval(selectOptionsJS, args)
		if err != nil {
			return "", err
		}
		if res.Value.Int() == 0 {
			return "", fmt.Errorf("no option matches %q", args)
		}
		return "selected " + strings.Join(args, ", ") + " in", nil
	},
	"check":   setChecked(true),
	"uncheck": setChecked(false),
	"scrollintoview": func(_ context.Context, _ *browserSession, el *rod.Element, _ []string) (string, error) {
		return "scrolled to", el.ScrollIntoView()
	},
	"text": func(_ context.Context, _ *browserSession, el *rod.Element, _ []string) (string, error) {
		return el.Text()
	},
}

// opsWithResult print their result instead of "<verb> <target>".
var opsWithResult = map[string]bool{"text": true}

// selectOptionsJS selects the options whose value or visible text is listed
// and fires the events a user's choice would. Returns how many matched.
const selectOptionsJS = `function (vals) {
	let n = 0;
	for (const o of this.options || []) {
		const m = vals.includes(o.value) || vals.includes(o.text.trim());
		if (this.multiple) o.selected = m;
		else if (m && n === 0) o.selected = true;
		if (m) n++;
	}
	if (n) {
		this.dispatchEvent(new Event('input', {bubbles: true}));
		this.dispatchEvent(new Event('change', {bubbles: true}));
	}
	return n;
}`

func setChecked(want bool) elementOp {
	return func(_ context.Context, _ *browserSession, el *rod.Element, _ []string) (string, error) {
		verb := map[bool]string{true: "checked", false: "unchecked"}[want]
		cur, err := el.Property("checked")
		if err != nil {
			return "", err
		}
		if cur.Bool() == want {
			return verb, nil
		}
		if err := el.Click(proto.InputMouseButtonLeft, 1); err != nil {
			return "", err
		}
		if now, err := el.Property("checked"); err == nil && now.Bool() != want {
			return "", fmt.Errorf("element did not become %s", verb)
		}
		return verb, nil
	}
}

func init() {
	for name, op := range elementOps {
		if name == "text" {
			continue
		}
		browserCommands[name] = elementCommand(name, op)
	}
	browserCommands["press"] = browserPress
	browserCommands["scroll"] = browserScroll
	browserCommands["drag"] = browserDrag
	browserCommands["mouse"] = browserMouse
	browserCommands["get"] = browserGet
	browserCommands["is"] = browserIs
	browserCommands["find"] = browserFind
	browserCommands["wait"] = browserWait
	browserCommands["eval"] = browserEval
}

func elementCommand(name string, op elementOp) browserHandler {
	return func(ctx context.Context, s *browserSession, args []string) (string, error) {
		t, err := argN(args, 0, "target")
		if err != nil {
			return "", err
		}
		el, err := s.target(ctx, t)
		if err != nil {
			return "", err
		}
		out, err := op(ctx, s, el, args[1:])
		if err != nil || opsWithResult[name] {
			return out, err
		}
		return out + " " + t, nil
	}
}

// namedKeys maps key names an agent may use to rod keys.
var namedKeys = map[string]input.Key{
	"enter": input.Enter, "tab": input.Tab, "escape": input.Escape, "esc": input.Escape,
	"backspace": input.Backspace, "delete": input.Delete, "space": input.Space, "insert": input.Insert,
	"arrowup": input.ArrowUp, "arrowdown": input.ArrowDown, "arrowleft": input.ArrowLeft, "arrowright": input.ArrowRight,
	"up": input.ArrowUp, "down": input.ArrowDown, "left": input.ArrowLeft, "right": input.ArrowRight,
	"home": input.Home, "end": input.End, "pageup": input.PageUp, "pagedown": input.PageDown,
	"control": input.ControlLeft, "ctrl": input.ControlLeft, "shift": input.ShiftLeft,
	"alt": input.AltLeft, "meta": input.MetaLeft, "cmd": input.MetaLeft,
	"f1": input.F1, "f2": input.F2, "f3": input.F3, "f4": input.F4, "f5": input.F5, "f6": input.F6,
	"f7": input.F7, "f8": input.F8, "f9": input.F9, "f10": input.F10, "f11": input.F11, "f12": input.F12,
}

// keyDefined reports whether rod knows k; Key.Info panics otherwise.
func keyDefined(k input.Key) (ok bool) {
	defer func() {
		if recover() != nil {
			ok = false
		}
	}()
	k.Info()
	return true
}

// parseKey reads "Enter", "a", "Control+Shift+a": modifiers then one key.
func parseKey(s string) ([]input.Key, error) {
	var keys []input.Key
	for _, part := range strings.Split(s, "+") {
		if k, ok := namedKeys[strings.ToLower(part)]; ok {
			keys = append(keys, k)
			continue
		}
		r, size := utf8.DecodeRuneInString(part)
		if size == 0 || size != len(part) || !keyDefined(input.Key(r)) {
			return nil, fmt.Errorf("unknown key %q", part)
		}
		keys = append(keys, input.Key(r))
	}
	return keys, nil
}

func browserPress(ctx context.Context, s *browserSession, args []string) (string, error) {
	spec, err := argN(args, 0, "key")
	if err != nil {
		return "", err
	}
	keys, err := parseKey(spec)
	if err != nil {
		return "", err
	}
	page, err := s.page()
	if err != nil {
		return "", err
	}
	// Modifiers stay down while the last key is typed; Do releases them.
	ka := page.Context(ctx).KeyActions()
	if len(keys) > 1 {
		ka = ka.Press(keys[:len(keys)-1]...)
	}
	return "pressed " + spec, ka.Type(keys[len(keys)-1]).Do()
}

// typeText sends real keystrokes for keyboard characters (so key handlers
// fire) and inserts anything else as text.
func typeText(p *rod.Page, text string) error {
	for _, r := range text {
		k := input.Key(r)
		if r == '\n' {
			k = input.Enter
		}
		if keyDefined(k) {
			if err := p.Keyboard.Type(k); err != nil {
				return err
			}
			continue
		}
		if err := p.InsertText(string(r)); err != nil {
			return err
		}
	}
	return nil
}

func browserScroll(ctx context.Context, s *browserSession, args []string) (string, error) {
	dir, err := argN(args, 0, "direction")
	if err != nil {
		return "", err
	}
	px := 500
	if len(args) > 1 {
		if px, err = strconv.Atoi(args[1]); err != nil {
			return "", fmt.Errorf("invalid pixels %q", args[1])
		}
	}
	d, ok := map[string][2]int{"up": {0, -px}, "down": {0, px}, "left": {-px, 0}, "right": {px, 0}}[dir]
	if !ok {
		return "", fmt.Errorf("direction must be up, down, left or right")
	}
	dx, dy := d[0], d[1]
	page, err := s.page()
	if err != nil {
		return "", err
	}
	_, err = page.Context(ctx).Eval(`(x, y) => window.scrollBy(x, y)`, dx, dy)
	return "scrolled " + dir, err
}

func elementCenter(el *rod.Element) (proto.Point, error) {
	shape, err := el.Shape()
	if err != nil {
		return proto.Point{}, err
	}
	box := shape.Box()
	if box == nil {
		return proto.Point{}, errors.New("element has no box (hidden?)")
	}
	return proto.NewPoint(box.X+box.Width/2, box.Y+box.Height/2), nil
}

// browserDrag moves the mouse from one element to another. HTML5 drag and
// drop is not driven by synthetic mouse events, so a drag Chrome intercepts
// is replayed with drag events at the target.
func browserDrag(ctx context.Context, s *browserSession, args []string) (string, error) {
	if len(args) < 2 {
		return "", errors.New("usage: drag <source> <target>")
	}
	src, err := s.target(ctx, args[0])
	if err != nil {
		return "", err
	}
	dst, err := s.target(ctx, args[1])
	if err != nil {
		return "", err
	}
	if err := src.ScrollIntoView(); err != nil {
		return "", err
	}
	from, err := elementCenter(src)
	if err != nil {
		return "", err
	}
	to, err := elementCenter(dst)
	if err != nil {
		return "", err
	}
	page, err := s.page()
	if err != nil {
		return "", err
	}
	p := page.Context(ctx)

	lctx, stop := context.WithCancel(ctx)
	defer stop()
	intercepted := make(chan *proto.InputDragData, 1)
	go p.Context(lctx).EachEvent(func(e *proto.InputDragIntercepted) bool {
		intercepted <- e.Data
		return true
	})()
	if err := (proto.InputSetInterceptDrags{Enabled: true}).Call(p); err != nil {
		return "", err
	}
	defer func() { _ = proto.InputSetInterceptDrags{Enabled: false}.Call(p) }()

	m := p.Mouse
	if err := m.MoveTo(from); err != nil {
		return "", err
	}
	if err := m.Down(proto.InputMouseButtonLeft, 1); err != nil {
		return "", err
	}
	if err := m.MoveLinear(to, 10); err != nil {
		return "", err
	}
	select {
	case data := <-intercepted:
		for _, typ := range []proto.InputDispatchDragEventType{proto.InputDispatchDragEventTypeDragEnter, proto.InputDispatchDragEventTypeDragOver, proto.InputDispatchDragEventTypeDrop} {
			if err := (proto.InputDispatchDragEvent{Type: typ, X: to.X, Y: to.Y, Data: data}).Call(p); err != nil {
				return "", err
			}
		}
	case <-time.After(300 * time.Millisecond):
	}
	return "dragged " + args[0] + " to " + args[1], m.Up(proto.InputMouseButtonLeft, 1)
}

func browserMouse(ctx context.Context, s *browserSession, args []string) (string, error) {
	action, err := argN(args, 0, "action (move, down, up, wheel)")
	if err != nil {
		return "", err
	}
	page, err := s.page()
	if err != nil {
		return "", err
	}
	m := page.Context(ctx).Mouse
	nums := make([]float64, 0, 2)
	button := proto.InputMouseButtonLeft
	for _, a := range args[1:] {
		switch a {
		case "left", "right", "middle":
			button = proto.InputMouseButton(a)
		default:
			f, err := strconv.ParseFloat(a, 64)
			if err != nil {
				return "", fmt.Errorf("invalid number %q", a)
			}
			nums = append(nums, f)
		}
	}
	switch action {
	case "move":
		if len(nums) != 2 {
			return "", errors.New("usage: mouse move <x> <y>")
		}
		return "mouse moved", m.MoveTo(proto.NewPoint(nums[0], nums[1]))
	case "down":
		return "mouse down", m.Down(button, 1)
	case "up":
		return "mouse up", m.Up(button, 1)
	case "wheel":
		if len(nums) == 0 {
			return "", errors.New("usage: mouse wheel <dy> [dx]")
		}
		dx := 0.0
		if len(nums) > 1 {
			dx = nums[1]
		}
		return "mouse wheel", m.Scroll(dx, nums[0], 1)
	}
	return "", fmt.Errorf("unknown mouse action %q", action)
}

func browserGet(ctx context.Context, s *browserSession, args []string) (string, error) {
	what, err := argN(args, 0, "what (text, html, value, attr, count, box, title, url)")
	if err != nil {
		return "", err
	}
	page, err := s.page()
	if err != nil {
		return "", err
	}
	p := page.Context(ctx)
	switch what {
	case "title", "url":
		return pageInfo(func(i pageSummary) string {
			if what == "url" {
				return i.url
			}
			return i.title
		})(ctx, s, nil)
	case "count":
		sel, err := argN(args, 1, "selector")
		if err != nil {
			return "", err
		}
		els, err := p.Elements(sel)
		return strconv.Itoa(len(els)), err
	case "text", "html":
		if len(args) < 2 {
			if what == "html" {
				return p.HTML()
			}
			res, err := p.Eval(`() => document.body ? document.body.innerText : ''`)
			if err != nil {
				return "", err
			}
			return res.Value.Str(), nil
		}
	}
	t, err := argN(args, 1, "target")
	if err != nil {
		return "", err
	}
	el, err := s.target(ctx, t)
	if err != nil {
		return "", err
	}
	switch what {
	case "text":
		return el.Text()
	case "html":
		return el.HTML()
	case "value":
		v, err := el.Property("value")
		return v.Str(), err
	case "attr":
		name, err := argN(args, 2, "attribute name")
		if err != nil {
			return "", err
		}
		v, err := el.Attribute(name)
		if err != nil {
			return "", err
		}
		if v == nil {
			return "", fmt.Errorf("%s has no attribute %q", t, name)
		}
		return *v, nil
	case "box":
		shape, err := el.Shape()
		if err != nil {
			return "", err
		}
		b := shape.Box()
		if b == nil {
			return "", errors.New("element has no box (hidden?)")
		}
		return fmt.Sprintf("x=%.0f y=%.0f w=%.0f h=%.0f", b.X, b.Y, b.Width, b.Height), nil
	}
	return "", fmt.Errorf("unknown get %q", what)
}

func browserIs(ctx context.Context, s *browserSession, args []string) (string, error) {
	if len(args) < 2 {
		return "", errors.New("usage: is visible|enabled|checked <target>")
	}
	el, err := s.target(ctx, args[1])
	if err != nil {
		return "", err
	}
	var v bool
	switch args[0] {
	case "visible":
		v, err = el.Visible()
	case "enabled":
		v, err = el.Disabled()
		v = !v
	case "checked":
		var j interface{ Bool() bool }
		j, err = el.Property("checked")
		if err == nil {
			v = j.Bool()
		}
	default:
		return "", fmt.Errorf("unknown state %q", args[0])
	}
	return strconv.FormatBool(v), err
}

// browserFind locates elements by role/name, text, label or attribute,
// then either lists them with refs or runs an element action on the first.
func browserFind(ctx context.Context, s *browserSession, args []string) (string, error) {
	if len(args) < 2 {
		return "", errors.New("usage: find role|text|label|placeholder|alt|title|testid <value> [action [value]]")
	}
	kind, value, rest := args[0], args[1], args[2:]
	name := ""
	if kind == "role" && len(rest) >= 2 && rest[0] == "--name" {
		name, rest = rest[1], rest[2:]
	}
	page, err := s.page()
	if err != nil {
		return "", err
	}
	p := page.Context(ctx).Sleeper(rod.NotFoundSleeper)

	var els rod.Elements
	switch kind {
	case "role":
		els, err = findByRole(p, value, name)
	case "text":
		var el *rod.Element
		if el, err = p.ElementByJS(rod.Eval(findByTextJS, value)); err == nil {
			els = rod.Elements{el}
		}
	case "label":
		els, err = p.ElementsByJS(rod.Eval(findByLabelJS, value))
	case "placeholder", "alt", "title":
		els, err = p.Elements(fmt.Sprintf("[%s*=%s i]", kind, strconv.Quote(value)))
	case "testid":
		els, err = p.Elements(fmt.Sprintf("[data-testid=%s]", strconv.Quote(value)))
	default:
		return "", fmt.Errorf("unknown find kind %q", kind)
	}
	var notFound *rod.ElementNotFoundError
	if errors.As(err, &notFound) || (err == nil && len(els) == 0) {
		return "", fmt.Errorf("no element found by %s %q", kind, value)
	}
	if err != nil {
		return "", err
	}

	if len(rest) > 0 {
		op, ok := elementOps[rest[0]]
		if !ok {
			return "", fmt.Errorf("unknown find action %q", rest[0])
		}
		out, err := op(ctx, s, actionable(els[0]), rest[1:])
		if err != nil || opsWithResult[rest[0]] {
			return out, err
		}
		return out + " " + kind + " " + strconv.Quote(value), nil
	}
	return s.describeMatches(page, els)
}

// describeMatches lists elements with fresh refs added to the ref table.
func (s *browserSession) describeMatches(page *rod.Page, els rod.Elements) (string, error) {
	if s.refsPage != page {
		s.refs, s.refsPage = map[string]proto.DOMBackendNodeID{}, page
	}
	var b strings.Builder
	for _, el := range els {
		desc, err := el.Describe(0, false)
		if err != nil {
			continue
		}
		ref := "e" + strconv.Itoa(len(s.refs)+1)
		s.refs[ref] = desc.BackendNodeID
		text, _ := el.Text()
		if len(text) > 80 {
			text = text[:80] + "…"
		}
		fmt.Fprintf(&b, "- %s %q [ref=%s]\n", strings.ToLower(desc.NodeName), strings.TrimSpace(text), ref)
	}
	return strings.TrimRight(b.String(), "\n"), nil
}

func findByRole(p *rod.Page, role, name string) (rod.Elements, error) {
	doc, err := p.Element("html")
	if err != nil {
		return nil, err
	}
	res, err := proto.AccessibilityQueryAXTree{ObjectID: doc.Object.ObjectID, Role: role, AccessibleName: name}.Call(p)
	if err != nil {
		return nil, err
	}
	var els rod.Elements
	for _, n := range res.Nodes {
		if n.Ignored || n.BackendDOMNodeID == 0 {
			continue
		}
		obj, err := proto.DOMResolveNode{BackendNodeID: n.BackendDOMNodeID}.Call(p)
		if err != nil {
			continue
		}
		if el, err := p.ElementFromObject(obj.Object); err == nil {
			els = append(els, el)
		}
	}
	return els, nil
}

// findByLabelJS returns form controls whose label or aria-label contains the text.
const findByLabelJS = `(text) => {
	const t = text.toLowerCase(), out = new Set();
	for (const l of document.querySelectorAll('label')) {
		if (l.textContent.toLowerCase().includes(t) && l.control) out.add(l.control);
	}
	for (const el of document.querySelectorAll('[aria-label]')) {
		if (el.getAttribute('aria-label').toLowerCase().includes(t)) out.add(el);
	}
	return [...out];
}`

func browserWait(ctx context.Context, s *browserSession, args []string) (string, error) {
	what, err := argN(args, 0, "what to wait for")
	if err != nil {
		return "", err
	}
	page, err := s.page()
	if err != nil {
		return "", err
	}
	p := page.Context(ctx)
	if ms, err := strconv.Atoi(what); err == nil {
		select {
		case <-time.After(time.Duration(ms) * time.Millisecond):
			return fmt.Sprintf("waited %dms", ms), nil
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}
	switch what {
	case "--text", "--url", "--fn":
		v, err := argN(args, 1, "value")
		if err != nil {
			return "", err
		}
		js := map[string]string{
			"--text": `(t) => !!document.body && document.body.innerText.includes(t)`,
			"--url":  `(u) => location.href.includes(u)`,
		}[what]
		var opts *rod.EvalOptions
		if what == "--fn" {
			opts = rod.Eval(`() => (` + v + `)`)
		} else {
			opts = rod.Eval(js, v)
		}
		return "condition met", p.Wait(opts)
	case "--load":
		if len(args) > 1 && args[1] == "idle" {
			p.WaitRequestIdle(500*time.Millisecond, nil, nil, nil)()
			return "network idle", ctx.Err()
		}
		return "loaded", p.WaitLoad()
	}
	// A target that may not exist yet: CSS, xpath and text= retry until the timeout.
	var el *rod.Element
	switch {
	case strings.HasPrefix(what, "@"):
		el, err = s.target(ctx, what)
	case strings.HasPrefix(what, "text="):
		el, err = p.ElementByJS(rod.Eval(findByTextJS, strings.TrimPrefix(what, "text=")))
	case strings.HasPrefix(what, "xpath="):
		el, err = p.ElementX(strings.TrimPrefix(what, "xpath="))
	default:
		el, err = p.Element(what)
	}
	if err != nil {
		return "", err
	}
	return "visible " + what, el.WaitVisible()
}

// browserEval runs JS in the page: an expression, or a function body when it
// does not parse as one. Promises are awaited.
func browserEval(ctx context.Context, s *browserSession, args []string) (string, error) {
	if len(args) == 0 {
		return "", errors.New("missing script")
	}
	js := strings.Join(args, " ")
	page, err := s.page()
	if err != nil {
		return "", err
	}
	p := page.Context(ctx)
	fn := "async () => (" + js + "\n)"
	// Decide expression vs body by compiling only: retrying after a failed
	// run would repeat its side effects (a runtime SyntaxError, e.g. JSON.parse).
	compiled, err := proto.RuntimeCompileScript{Expression: fn}.Call(p)
	if err != nil {
		return "", err
	}
	if compiled.ExceptionDetails != nil {
		fn = "async () => {" + js + "\n}"
	}
	res, err := p.Evaluate(rod.Eval(fn).ByPromise())
	if err != nil {
		return "", err
	}
	return remoteObjectString(res), nil
}
