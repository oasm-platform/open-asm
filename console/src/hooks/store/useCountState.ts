import createState from "../createState";

const useCountState = createState<number>("count", 1, {
  inc: (state: number) => state + 1,
  dec: (state: number) => state - 1,
  reset: () => 1,
});

export { useCountState };
