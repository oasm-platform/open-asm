package worker

import (
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/go-rod/rod/lib/input"
)

func TestParseKey(t *testing.T) {
	ks, err := parseKey("Control+Shift+a")
	if err != nil || len(ks) != 3 || ks[0] != input.ControlLeft || ks[1] != input.ShiftLeft || ks[2] != input.KeyA {
		t.Fatalf("%v %v", ks, err)
	}
	if ks, err := parseKey("Enter"); err != nil || ks[0] != input.Enter {
		t.Fatalf("Enter: %v %v", ks, err)
	}
	for _, bad := range []string{"Control+Nope", "", "é"} {
		if _, err := parseKey(bad); err == nil {
			t.Errorf("%q must be rejected", bad)
		}
	}
}

const formPage = `<title>Form</title>
<input id="n" aria-label="Name">
<label>Agree <input type="checkbox" id="c"></label>
<select id="s"><option value="a">Alpha</option><option value="b">Beta</option></select>
<input id="k" placeholder="Search here" onkeydown="document.title = 'key:' + event.key">
<button onclick="document.title = n.value + '|' + c.checked + '|' + s.value">Go</button>
<button onclick="document.title = 'saved'">Save</button>
<button data-testid="later" onclick="setTimeout(() => { const p = document.createElement('p'); p.id = 'late'; p.textContent = 'ready now'; document.body.append(p) }, 300)">Later</button>
<ul><li>1</li><li>2</li><li>3</li></ul>
<div style="height:3000px"></div>`

func TestFormInteractions(t *testing.T) {
	a := newTestBrowsers(t)
	srv := serveHTML(t, map[string]string{"/": formPage})
	id, _ := openSession(t, a, srv.URL)
	run := func(line string) string { return runOK(t, a, "-s "+id+" "+line) }

	run(`fill #n "hello world"`)
	run("check #c")
	run("select #s Beta")
	if out := run("click text=Go"); out != "clicked text=Go" {
		t.Fatalf("click output %q", out)
	}
	if got := run("title"); got != "hello world|true|b" {
		t.Fatalf("after form actions title = %q", got)
	}
	run("type #n !")
	if got := run("get value #n"); got != "hello world!" {
		t.Fatalf("type must append, value = %q", got)
	}
	run("fill #n x")
	if got := run("get value #n"); got != "x" {
		t.Fatalf("fill must replace, value = %q", got)
	}
	if run("is checked #c") != "true" || run("uncheck #c") != "unchecked #c" || run("is checked #c") != "false" {
		t.Fatal("check/uncheck")
	}
	if out := runFail(t, a, "-s "+id+" select #s Gamma"); !strings.Contains(out, "no option matches") {
		t.Fatalf("bad option:\n%s", out)
	}

	run("focus #k")
	run("press ArrowDown")
	if got := run("title"); got != "key:ArrowDown" {
		t.Fatalf("press title = %q", got)
	}
	if out := runFail(t, a, "-s "+id+" click #nope"); !strings.Contains(out, `no element matches "#nope"`) {
		t.Fatalf("missing element:\n%s", out)
	}
}

func TestFindVariants(t *testing.T) {
	a := newTestBrowsers(t)
	srv := serveHTML(t, map[string]string{"/": formPage})
	id, _ := openSession(t, a, srv.URL)
	run := func(line string) string { return runOK(t, a, "-s "+id+" "+line) }

	run("find role button --name Save click")
	if got := run("title"); got != "saved" {
		t.Fatalf("find role click: title %q", got)
	}
	run(`find placeholder search fill "abc"`)
	run(`find label Name fill "Bob"`)
	if run("get value #k") != "abc" || run("get value #n") != "Bob" {
		t.Fatal("find fill by placeholder/label")
	}
	list := run("find role button")
	refs := regexp.MustCompile(`\[ref=(e\d+)\]`).FindAllStringSubmatch(list, -1)
	if len(refs) != 3 || !strings.Contains(list, `"Save"`) {
		t.Fatalf("find list:\n%s", list)
	}
	run("click @" + refs[1][1]) // the listed refs are usable
	if got := run("title"); got != "saved" {
		t.Fatalf("click listed ref: title %q", got)
	}
	if got := run("find testid later text"); got != "Later" {
		t.Fatalf("find text action = %q", got)
	}
	if out := runFail(t, a, "-s "+id+" find text Nothing"); !strings.Contains(out, `no element found by text "Nothing"`) {
		t.Fatalf("find nothing:\n%s", out)
	}
}

func TestWaitReadAndEval(t *testing.T) {
	a := newTestBrowsers(t)
	srv := serveHTML(t, map[string]string{"/": formPage})
	id, _ := openSession(t, a, srv.URL)
	run := func(line string) string { return runOK(t, a, "-s "+id+" "+line) }

	run("click [data-testid=later]")
	run("wait #late")
	run(`wait --text "ready now"`)
	run("wait 20")
	run("wait --url /")
	run(`wait --fn "document.querySelectorAll('li').length === 3"`)
	run("wait --load idle")
	if out := runFail(t, a, "-s "+id+" --timeout 500 wait #never"); !strings.Contains(out, "timed out after 500ms") {
		t.Fatalf("wait timeout:\n%s", out)
	}

	if run("eval 1+2") != "3" || run(`eval "({a: 1})"`) != `{"a":1}` || run(`eval "document.title"`) != "Form" {
		t.Fatal("eval expressions")
	}
	if got := run(`eval "const x = 2; return x * 5;"`); got != "10" {
		t.Fatalf("eval body = %q", got)
	}
	if got := run(`eval "await new Promise(r => setTimeout(() => r('done'), 10))"`); got != "done" {
		t.Fatalf("eval promise = %q", got)
	}
	if out := runFail(t, a, "-s "+id+" eval \"throw new Error('boom')\""); !strings.Contains(out, "boom") {
		t.Fatalf("eval error:\n%s", out)
	}

	if run("get count li") != "3" || run("get text li") != "1" || run("get attr #k placeholder") != "Search here" {
		t.Fatal("get count/text/attr")
	}
	if !regexp.MustCompile(`^x=\d+ y=\d+ w=\d+ h=\d+$`).MatchString(run("get box #n")) {
		t.Fatal("get box")
	}
	if !strings.Contains(run("get text"), "Alpha") || !strings.Contains(run("get html"), `id="late"`) {
		t.Fatal("page text/html")
	}
	if run("is visible #n") != "true" || run("is enabled #n") != "true" {
		t.Fatal("is visible/enabled")
	}
	run("scroll down 800")
	if y, _ := strconv.Atoi(run("eval window.scrollY")); y < 800 {
		t.Fatalf("scrollY = %d", y)
	}
	run("scrollintoview #n")
	run("mouse move 10 10")
	run("mouse wheel 100")
}

func TestDragHTML5(t *testing.T) {
	a := newTestBrowsers(t)
	srv := serveHTML(t, map[string]string{"/": `<title>D</title>
<div id="src" draggable="true" style="width:50px;height:50px;background:red" ondragstart="event.dataTransfer.setData('text/plain','x')">S</div>
<div id="dst" style="width:100px;height:100px;margin-top:100px;background:blue" ondragover="event.preventDefault()" ondrop="event.preventDefault(); document.title='dropped'">D</div>`})
	id, _ := openSession(t, a, srv.URL)
	runOK(t, a, "-s "+id+" drag #src #dst")
	if got := runOK(t, a, "-s "+id+" title"); got != "dropped" {
		t.Fatalf("title after drag = %q", got)
	}
}
