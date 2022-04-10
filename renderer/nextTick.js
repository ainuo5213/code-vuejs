export function nextTick(cb) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cb();
    });
  });
}

export function reflow() {
  document.body.offsetHeight;
}
