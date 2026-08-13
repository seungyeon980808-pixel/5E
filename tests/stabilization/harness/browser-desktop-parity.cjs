function createForbiddenTransportRecorder() {
  const calls = [];
  const reject = (channel) => async () => {
    calls.push(channel);
    throw new Error(`forbidden local-file transport: ${channel}`);
  };
  return {
    calls,
    ports: {
      attachmentIpc: reject("attachment-ipc"),
      modelSend: reject("model-send"),
      networkRequest: reject("network-request"),
      toolTransmission: reject("tool-transmission"),
    },
  };
}

function assertBrowserDesktopParity(assert, browser, desktop) {
  assert.deepEqual(desktop.outcome, browser.outcome);
  assert.deepEqual(browser.transportCalls, []);
  assert.deepEqual(desktop.transportCalls, []);
}

module.exports = { assertBrowserDesktopParity, createForbiddenTransportRecorder };
