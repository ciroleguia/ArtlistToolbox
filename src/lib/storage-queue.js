// Promise-chain serial execution queue to prevent read-modify-write races on
// chrome.storage.local across rapid user actions.

export function createSerialQueue() {
  let tail = Promise.resolve();

  function enqueue(task) {
    const run = tail.then(() => task());
    tail = run.catch(() => {});
    return run;
  }

  return { enqueue };
}
