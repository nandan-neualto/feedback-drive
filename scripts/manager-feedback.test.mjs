import test from 'node:test';
import assert from 'node:assert/strict';
import { selectManagerFeedback } from '../app/lib/manager-feedback.ts';
import { selectFeedback } from '../app/lib/board.ts';
const base={name:'Alex',contact:'private@example.test',avatar:'default',category:'Service',title:'A better visit',message:'Clearer updates would help',suggestion:'',photos:[],kioskId:'K-01',area:'Showroom',createdAt:'2026-10-12T10:00:00Z'};
const rows=[{...base,id:'abcd1234-public',published:true,status:'new'},{...base,id:'private',published:false,status:'reviewed'},{...base,id:'archived',published:false,status:'hidden'}];
const filters={category:'all',status:'all',area:'all',search:'',visibility:'all'};
test('manager visibility and status filters compose without losing private feedback',()=>{
 assert.deepEqual(selectManagerFeedback(rows,{...filters,visibility:'public'}).map(x=>x.id),['abcd1234-public']);
 assert.deepEqual(selectManagerFeedback(rows,{...filters,visibility:'private',status:'reviewed'}).map(x=>x.id),['private']);
 assert.deepEqual(selectManagerFeedback(rows,{...filters,visibility:'private',status:'hidden'}).map(x=>x.id),['archived']);
 assert.deepEqual(selectManagerFeedback(rows,{...filters,visibility:'public',status:'hidden'}),[]);
});
test('manager reference and station search uses the same normalized selection as export',()=>{
 assert.deepEqual(selectManagerFeedback(rows,{...filters,search:' ＡＢＣＤ１２３４ '}).map(x=>x.id),['abcd1234-public']);
 assert.equal(selectManagerFeedback(rows,{...filters,search:'k-01'}).length,3);
 assert.equal(selectManagerFeedback(rows,{...filters,search:'private@example.test'}).length,3);
 assert.equal(selectManagerFeedback(rows,{...filters,search:'showroom',area:'Workshop'}).length,0);
});
test('public reference search never exposes private records or contact details',()=>{
 const publicFilters={category:'All',search:'ABCD1234',sort:'newest',photosOnly:false,savedOnly:false,saved:[]};
 assert.deepEqual(selectFeedback(rows,publicFilters).map(x=>x.id),['abcd1234-public']);
 assert.deepEqual(selectFeedback(rows,{...publicFilters,search:'private@example.test'}),[]);
 assert.deepEqual(selectFeedback(rows,{...publicFilters,search:'private'}),[]);
});
