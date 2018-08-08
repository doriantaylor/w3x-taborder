/* lol */

if (typeof browser == "undefined" && typeof chrome == "object") {
    browser = chrome;
}

function togglePinned (ev) {
    //console.log(ev.target.checked);
    browser.storage.sync.set({ 'pinned-tabs': ev.target.checked });
    ev.preventDefault();
}

function restoreState () {
    //console.log('whiskey tango foxtrot');
    browser.storage.sync.get('pinned-tabs').then(x => {
        //console.log(x);
        document.getElementById('pinned').checked = x['pinned-tabs'];
    }, y => { console.log(y) });
}

document.addEventListener('DOMContentLoaded', restoreState, false);
document.getElementById('pinned').addEventListener(
    'change', togglePinned, false);
