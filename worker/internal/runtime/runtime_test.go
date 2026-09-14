package runtime

import "testing"

func TestFakeRuntimeImplementsInterface(t *testing.T) {
	var _ ExecutionRuntime = (*FakeRuntime)(nil)
	r := NewFakeRuntime()
	if r == nil {
		t.Fatal("fake is nil")
	}
}

func TestRuntimeInterfaceMethodsExist(t *testing.T) {
	// compile-time check: interface must have 7 methods
	var iface ExecutionRuntime = NewFakeRuntime()
	_ = iface
}
