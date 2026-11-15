const assert=require('node:assert/strict');const {buildTimeline,clockText}=require('./travel-globe/dist/prototype/core.js');
const v=(uid,duration=60,fixed='')=>({uid,place:'p-'+uid,duration,fixed});
const legs={'transit:a>b':18,'transit:b>c':24};
const normal=buildTimeline({start:'09:00',mode:'transit',visits:[v('a'),v('b'),v('c')],legs});assert.equal(normal.end,762);assert.equal(normal.totalMove,42);assert.equal(normal.complete,true);
const unknown=buildTimeline({start:'09:00',mode:'transit',visits:[v('a'),v('b'),v('c')]});assert.equal(unknown.complete,false);assert.equal(unknown.rows[1].start,null);assert.equal(unknown.end,null);
const fixed=buildTimeline({start:'09:00',mode:'transit',visits:[v('a'),v('b',60,'12:00'),v('c')]});assert.equal(fixed.rows[1].anchored,true);assert.equal(fixed.complete,false);
const clash=buildTimeline({start:'09:00',mode:'transit',visits:[v('a',120),v('b',60,'10:00')],legs:{'transit:a>b':18}});assert.equal(clash.rows[1].late,78);assert.equal(clash.rows[1].start,678);
assert.equal(clockText(1470),'+1일 00:30');console.log('Passed: duration totals, unknown legs, fixed-time re-anchoring, conflicts, midnight rollover');
