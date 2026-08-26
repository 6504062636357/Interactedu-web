// SCORM 1.2 API wrapper — หา window.API จาก parent/opener chain แล้ว proxy คำสั่งให้
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed by player.js in the same SCORM package
var ScormAPI = (function () {
  var apiHandle = null;
  var findAttemptLimit = 500;

  function scanForAPI(win) {
    var attempts = 0;
    while (win.API == null && win.parent != null && win.parent !== win && attempts < findAttemptLimit) {
      attempts++;
      win = win.parent;
    }
    return win.API || null;
  }

  function findAPI() {
    var theAPI = null;

    if (window.parent != null && window.parent !== window) {
      theAPI = scanForAPI(window.parent);
    }

    if (theAPI == null && window.opener != null) {
      theAPI = scanForAPI(window.opener);
    }

    return theAPI;
  }

  function getAPI() {
    if (apiHandle == null) {
      apiHandle = findAPI();
    }
    return apiHandle;
  }

  function initialize() {
    var api = getAPI();
    if (!api) {
      console.warn("SCORM API not found — running outside an LMS.");
      return false;
    }
    var result = api.LMSInitialize("");
    return result === "true";
  }

  function setValue(key, value) {
    var api = getAPI();
    if (!api) return false;
    return api.LMSSetValue(key, value) === "true";
  }

  function getValue(key) {
    var api = getAPI();
    if (!api) return "";
    return api.LMSGetValue(key);
  }

  function commit() {
    var api = getAPI();
    if (!api) return false;
    return api.LMSCommit("") === "true";
  }

  function terminate() {
    var api = getAPI();
    if (!api) return false;
    var result = api.LMSFinish("");
    return result === "true";
  }

  return {
    initialize: initialize,
    setValue: setValue,
    getValue: getValue,
    commit: commit,
    terminate: terminate,
  };
})();
