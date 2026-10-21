package worker

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
)

func init() {
	browserCommands["snapshot"] = browserSnapshot
}

// interactiveRoles are the AX roles "snapshot -i" keeps.
var interactiveRoles = map[string]bool{
	"button": true, "link": true, "textbox": true, "searchbox": true, "checkbox": true,
	"radio": true, "combobox": true, "listbox": true, "option": true, "menuitem": true,
	"menuitemcheckbox": true, "menuitemradio": true, "tab": true, "switch": true,
	"slider": true, "spinbutton": true, "treeitem": true,
}

// silentRoles carry no meaning of their own; their children are kept.
var silentRoles = map[string]bool{"none": true, "generic": true, "RootWebArea": true, "InlineTextBox": true, "LineBreak": true, "": true}

// reportedProps are the AX states shown after a node, in this order.
var reportedProps = []proto.AccessibilityAXPropertyName{"checked", "selected", "expanded", "pressed", "disabled", "required", "focused", "level"}

func browserSnapshot(ctx context.Context, s *browserSession, args []string) (string, error) {
	interactive, depth, scope := false, 0, ""
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-i", "--interactive":
			interactive = true
		case "-d", "--depth":
			v, err := argN(args, i+1, "depth")
			if err != nil {
				return "", err
			}
			if depth, err = strconv.Atoi(v); err != nil || depth < 1 {
				return "", fmt.Errorf("invalid depth %q", v)
			}
			i++
		case "-s", "--selector":
			v, err := argN(args, i+1, "selector")
			if err != nil {
				return "", err
			}
			scope = v
			i++
		default:
			return "", fmt.Errorf("unknown snapshot option %q", args[i])
		}
	}
	return snapshot(ctx, s, interactive, depth, scope)
}

// snapshot renders the active page's accessibility tree, one node per line,
// and replaces the session's ref table with the refs it prints.
func snapshot(ctx context.Context, s *browserSession, interactiveOnly bool, depth int, scope string) (string, error) {
	page, err := s.page()
	if err != nil {
		return "", err
	}
	p := page.Context(ctx)
	tree, err := proto.AccessibilityGetFullAXTree{FrameID: p.FrameID}.Call(p)
	if err != nil {
		return "", err
	}
	byID := make(map[proto.AccessibilityAXNodeID]*proto.AccessibilityAXNode, len(tree.Nodes))
	for _, n := range tree.Nodes {
		byID[n.NodeID] = n
	}
	if len(tree.Nodes) == 0 {
		return "(empty page)", nil
	}
	root := tree.Nodes[0]
	if scope != "" {
		el, err := s.target(ctx, scope)
		if err != nil {
			return "", err
		}
		desc, err := el.Describe(0, false)
		if err != nil {
			return "", err
		}
		root = nil
		for _, n := range tree.Nodes {
			if n.BackendDOMNodeID == desc.BackendNodeID {
				root = n
				break
			}
		}
		if root == nil {
			return "", fmt.Errorf("%s is not in the accessibility tree (hidden?)", scope)
		}
	}

	refs := make(map[string]proto.DOMBackendNodeID)
	var b strings.Builder
	var walk func(n *proto.AccessibilityAXNode, level int, parentName string)
	walk = func(n *proto.AccessibilityAXNode, level int, parentName string) {
		role, name := axString(n.Role), axString(n.Name)
		printed := false
		switch {
		case n.Ignored || silentRoles[role]:
		case interactiveOnly && !interactiveRoles[role]:
		case role == "StaticText" && (name == "" || name == parentName):
		default:
			printed = true
			indent := level
			if interactiveOnly {
				indent = 0
			}
			b.WriteString(strings.Repeat("  ", indent))
			b.WriteString("- " + role)
			if name != "" {
				b.WriteString(" " + strconv.Quote(name))
			}
			if n.BackendDOMNodeID != 0 && role != "StaticText" && (interactiveRoles[role] || name != "") {
				ref := "e" + strconv.Itoa(len(refs)+1)
				refs[ref] = n.BackendDOMNodeID
				b.WriteString(" [ref=" + ref + "]")
			}
			b.WriteString(axProps(n))
			if v := axString(n.Value); v != "" {
				b.WriteString(" value=" + strconv.Quote(v))
			}
			b.WriteByte('\n')
		}
		next := level
		if printed {
			next++
			parentName = name
		}
		if depth > 0 && next >= depth && printed {
			return
		}
		for _, id := range n.ChildIDs {
			if c := byID[id]; c != nil {
				walk(c, next, parentName)
			}
		}
	}
	walk(root, 0, "")

	s.refs, s.refsPage = refs, page
	if b.Len() == 0 {
		if interactiveOnly {
			return "(no interactive elements)", nil
		}
		return "(empty page)", nil
	}
	return strings.TrimRight(b.String(), "\n"), nil
}

func axString(v *proto.AccessibilityAXValue) string {
	if v == nil || v.Value.Nil() {
		return ""
	}
	if s, ok := v.Value.Val().(string); ok {
		return s
	}
	return v.Value.JSON("", "")
}

func axProps(n *proto.AccessibilityAXNode) string {
	var b strings.Builder
	for _, want := range reportedProps {
		for _, p := range n.Properties {
			if p.Name != want {
				continue
			}
			switch v := axString(p.Value); {
			case want == "level":
				b.WriteString(" [level=" + v + "]")
			case v == "true" || v == "mixed":
				b.WriteString(" [" + string(want))
				if v == "mixed" {
					b.WriteString("=mixed")
				}
				b.WriteString("]")
			}
		}
	}
	return b.String()
}

// target resolves a command target: @eN from the last snapshot, xpath=,
// text=, else a CSS selector. It never waits for an element to appear (use
// "wait" for that), so a typo fails at once instead of at the timeout.
func (s *browserSession) target(ctx context.Context, t string) (*rod.Element, error) {
	page, err := s.page()
	if err != nil {
		return nil, err
	}
	p := page.Context(ctx).Sleeper(rod.NotFoundSleeper)
	var el *rod.Element
	switch {
	case strings.HasPrefix(t, "@"):
		stale := fmt.Errorf("ref %s not found; run \"browser -s %s snapshot\" again", t, s.id)
		id, ok := s.refs[t[1:]]
		if !ok || s.refsPage != page {
			return nil, stale
		}
		obj, rerr := proto.DOMResolveNode{BackendNodeID: id}.Call(p)
		if rerr != nil {
			return nil, stale
		}
		el, err = p.ElementFromObject(obj.Object)
	case strings.HasPrefix(t, "xpath="):
		el, err = p.ElementX(strings.TrimPrefix(t, "xpath="))
	case strings.HasPrefix(t, "text="):
		el, err = p.ElementByJS(rod.Eval(findByTextJS, strings.TrimPrefix(t, "text=")))
	default:
		el, err = p.Element(t)
	}
	var notFound *rod.ElementNotFoundError
	if errors.As(err, &notFound) || (err == nil && el == nil) {
		return nil, fmt.Errorf("no element matches %q", t)
	}
	if err != nil {
		return nil, err
	}
	return actionable(el), nil
}

// actionable lets an element found without waiting still wait, up to the
// command timeout, for what its action needs (visible, not covered).
func actionable(el *rod.Element) *rod.Element { return el.Sleeper(rod.DefaultSleeper) }

// findByTextJS returns the innermost visible element whose text contains the
// argument, preferring clickable ones.
const findByTextJS = `(text) => {
	const hits = [...document.querySelectorAll('body *')].filter(el =>
		el.offsetParent !== null && (el.innerText || el.value || '').includes(text) &&
		![...el.children].some(c => (c.innerText || '').includes(text)));
	return hits.find(el => el.matches('a,button,input,select,textarea,label,[role],[onclick],[tabindex]')) || hits[0] || null;
}`
