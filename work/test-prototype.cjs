const assert=require('node:assert/strict');const {buildTimeline,clockText}=require('./travel-globe/dist/prototype/core.js');
const v=(duration=60,fixed='')=>({duration,fixed});
const normal=buildTimeline({start:'09:00',mode:'transit',scenario:'normal',visits:[v(),v(),v()]});assert.equal(normal.end,762);assert.equal(normal.totalMove,42);
const failed=buildTimeline({start:'09:00',mode:'transit',scenario:'failure',visits:[v(),v(),v()]});assert.equal(failed.complete,false);assert.equal(failed.rows[1].start,null);assert.equal(failed.end,null);
const fixed=buildTimeline({start:'09:00',mode:'transit',scenario:'failure',visits:[v(),v(60,'12:00'),v()]});assert.equal(fixed.rows[1].anchored,true);assert.equal(fixed.complete,false);
const clash=buildTimeline({start:'09:00',mode:'transit',scenario:'normal',visits:[v(120),v(60,'10:00')]});assert.equal(clash.rows[1].late,78);assert.equal(clash.rows[1].start,678);
assert.equal(clockText(1470),'+1일 00:30');console.log('Passed: duration totals, unknown legs, fixed-time re-anchoring, conflicts, midnight rollover');
