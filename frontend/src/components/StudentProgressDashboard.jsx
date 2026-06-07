import React from 'react';
import { collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc, addDoc, runTransaction } from 'firebase/firestore';
import * as xlsx from 'xlsx';
import { Download, Trophy, Users, RotateCcw, Search, X, Map, Clock, FileText, Calendar, Eye, EyeOff } from 'lucide-react';
import { db, auth } from '../firebase';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';

const v = React;
const q = db;
const Vy = auth;
const yH = xlsx;
const $V = xlsx.writeFile;
const Tp = collection;
const _m = where;
const hm = query;
const Fm = getDocs;
const Ep = doc;
const Pm = getDoc;
const Im = setDoc;
const Rm = deleteDoc;
const zm = addDoc;
const Nm = runTransaction;

// Icon mappings
const ZH = EyeOff;
const QH = Eye;
const YH = Download;
const CU = Trophy;
const TU = Users;
const cU = Map;
const WH = Clock;
const $H = FileText;
const LH = Calendar;
const EU = X;
const pU = RotateCcw;
const mU = Search;

const Q = { jsx, jsxs, Fragment };

function AU({
  worldsList:e,
  roundsList:t,
  filterRoundId:n,
  setFilterRoundId:r
}){
  let[
    i,
    a
  ]=(0,
  v.useState)([
    
  ]),
  [
    o,
    s
  ]=(0,
  v.useState)({
    
  }),
  [
    c,
    l
  ]=(0,
  v.useState)({
    
  }),
  [
    u,
    d
  ]=(0,
  v.useState)(!1),
  [
    f,
    p
  ]=(0,
  v.useState)(`All`),
  [
    m,
    h
  ]=(0,
  v.useState)(`All`),
  [
    g,
    _
  ]=(0,
  v.useState)(`All`),
  [
    y,
    b
  ]=(0,
  v.useState)(`All`),
  [
    x,
    S
  ]=(0,
  v.useState)(`All`),
  [
    C,
    w
  ]=(0,
  v.useState)(``),
  [
    T,
    E
  ]=(0,
  v.useState)(``),
  [
    D,
    O
  ]=(0,
  v.useState)(``),
  [
    k,
    A
  ]=(0,
  v.useState)(``),
  [
    j,
    M
  ]=(0,
  v.useState)(null),
  [
    N,
    P
  ]=(0,
  v.useState)(`map`),
  [
    F,
    I
  ]=(0,
  v.useState)({
    
  }),
  [
    L
  ]=(0,
  v.useState)(()=>Date.now()),
  ee=(0,
  v.useCallback)(async()=>{
    if(n){
      d(!0);
      try{
        let e=await Fm(hm(Tp(q,
        `PlayerCompetitionProgress`),
        _m(`roundId`,
        `==`,
        n))),
        t=[
          
        ];
        e.forEach(e=>{
          t.push({
            id:e.id,
            ...e.data()
          })
        }),
        a(t);
        let r=await Fm(hm(Tp(q,
        `UserStageProgress`),
        _m(`roundId`,
        `==`,
        n))),
        i={
          
        };
        r.forEach(e=>{
          let t=e.data(),
          n=t.playerId;
          i[
            n
          ]||(i[
            n
          ]={
            checkpoints:{
              
            },
            clearedCount:0
          });
          let r=`${
            t.worldId
          }_${
            t.stageId
          }_${
            t.checkpointId
          }`;
          i[
            n
          ].checkpoints[
            r
          ]=t,
          t.clearedAt&&i[
            n
          ].clearedCount++
        }),
        s(i);
        let o=await Fm(hm(Tp(q,
        `StageAttempts`),
        _m(`roundId`,
        `==`,
        n))),
        c={
          
        };
        o.forEach(e=>{
          let t=e.data(),
          n=t.playerId;
          c[
            n
          ]||(c[
            n
          ]=[
            
          ]),
          c[
            n
          ].push({
            id:e.id,
            ...t
          })
        }),
        l(c)
      }catch(e){
        console.error(`載入學生進度資料失敗`,
        e)
      }finally{
        d(!1)
      }
    }
  },
  [
    n
  ]);
  (0,
  v.useEffect)(()=>{
    let e=setTimeout(()=>{
      ee()
    },
    0);
    return()=>clearTimeout(e)
  },
  [
    n,
    ee
  ]);
  let R=async(e,
  t)=>{
    try{
      let n=Vy.currentUser?.email||`教師帳號`,
      r=Vy.currentUser?.uid||`teacher_admin`;
      await zm(Tp(q,
      `TeacherAuditLogs`),
      {
        teacherId:r,
        teacherEmail:n,
        action:e,
        details:t,
        timestamp:new Date().toISOString()
      })
    }catch(e){
      console.error(`寫入稽核日誌失敗`,
      e)
    }
  },
  te=e=>{
    if(!e)return 0;
    let t=new Date,
    n=t.getDay(),
    r=t.getDate()-n+(n===0?-6:1),
    i=new Date(t.setDate(r));
    i.setHours(0,
    0,
    0,
    0);
    let a=new Set;
    return e.forEach(e=>{
      if(e.completedAt){
        let t=new Date(e.completedAt);
        t>=i&&a.add(t.toDateString())
      }
    }),
    a.size
  },
  ne=e=>{
    let t=e.lastUpdatedAt?new Date(e.lastUpdatedAt):null;
    return!t||L-t.getTime()>10080*60*1e3?`7天未登入`:te(c[
      e.playerId
    ]||[
      
    ])>=1?`活躍`:`閒置`
  },
  re=e=>{
    let t=e.perfectClearCount||0,
    n=e.failedAttemptCount||0,
    r=e.retryCount||0,
    i=t+n+r;
    return i===0?0:t/i*100
  },
  z=e=>`${
    re(e).toFixed(1)
  }%`,
  B=async(e,
  t)=>{
    try{
      let n=await Fm(hm(Tp(q,
      `UserStageProgress`),
      _m(`playerId`,
      `==`,
      e),
      _m(`roundId`,
      `==`,
      t))),
      r=[
        
      ];
      n.forEach(e=>{
        r.push(e.data())
      });
      let i=await Fm(hm(Tp(q,
      `StageAttempts`),
      _m(`playerId`,
      `==`,
      e),
      _m(`roundId`,
      `==`,
      t))),
      a=[
        
      ];
      i.forEach(e=>{
        a.push(e.data())
      });
      let o=r.filter(e=>e.isPerfect&&e.clearedAt).length,
      s=a.filter(e=>!e.isCleared).length,
      c=a.filter(e=>e.attemptNumber>1&&e.isCleared).length,
      l=0,
      u=0,
      d=0,
      f=``,
      p=null;
      r.forEach(e=>{
        if(e.clearedAt){
          let t=parseInt(String(e.worldId).replace(/\D/g,
          ``),
          10)||0,
          n=parseInt(e.stageId,
          10)||0;
          t*100+n>l*100+u&&(l=t,
          u=n,
          d=n,
          f=e.checkpointId),
          (!p||e.clearedAt>p)&&(p=e.clearedAt)
        }
      });
      let m=await Pm(Ep(q,
      `ChallengeRounds`,
      t)),
      h=m.exists()?m.data():null,
      g=null,
      _=null;
      if(h){
        let n=parseInt(String(h.targetWorldId).replace(/\D/g,
        ``),
        10)||0,
        i=parseInt(h.targetStageIndex,
        10)||0;
        if(l*100+u>=n*100+i){
          let a=null;
          r.forEach(e=>{
            let t=parseInt(String(e.worldId).replace(/\D/g,
            ``),
            10)||0,
            r=parseInt(e.stageId,
            10)||0;
            e.clearedAt&&t*100+r>=n*100+i&&(!a||e.clearedAt<a)&&(a=e.clearedAt)
          }),
          g=a||p||new Date().toISOString();
          let o=await Fm(hm(Tp(q,
          `PlayerCompetitionProgress`),
          _m(`roundId`,
          `==`,
          t))),
          s=0;
          o.forEach(t=>{
            let n=t.data();
            n.playerId!==e&&n.targetReachedAt&&n.targetReachedAt<g&&s++
          }),
          _=s+1
        }
      }await Im(Ep(q,
      `PlayerCompetitionProgress`,
      `${
        e
      }_${
        t
      }`),
      {
        targetReachedAt:g,
        targetReachedRank:_,
        farthestWorldOrder:l,
        farthestStageIndex:u,
        farthestCheckpointIndex:d,
        farthestCheckpointId:f,
        perfectClearCount:o,
        failedAttemptCount:s,
        retryCount:c,
        lastUpdatedAt:p||new Date().toISOString()
      },
      {
        merge:!0
      })
    }catch(e){
      console.error(`Failed to recalculate player stats:`,
      e)
    }
  },
  V=async(e,
  t,
  r,
  i,
  a)=>{
    if(window.confirm(`確定要重置學員「${
      t
    }」在世界「${
      r.replace(/\D/g,
      ``)
    }」關卡「${
      a
    }」的挑戰紀錄嗎？\n\n這將會：\n1. 刪除該關卡的通關狀態與重試次數紀錄。\n2. 重新計算學員的累計進度與排行榜指標。`))try{
      if(await Rm(Ep(q,
      `UserStageProgress`,
      `${
        e
      }_${
        r
      }_${
        i
      }_${
        a
      }_${
        n
      }`)),
      await R(`reset_checkpoint_progress`,
      {
        playerId:e,
        studentNickname:t,
        worldId:r,
        stageId:i,
        checkpointId:a,
        roundId:n
      }),
      await B(e,
      n),
      alert(`✅ 已成功重置學員關卡紀錄！`),
      j&&j.playerId===e){
        let t=await Pm(Ep(q,
        `PlayerCompetitionProgress`,
        `${
          e
        }_${
          n
        }`));
        t.exists()&&M(t.data())
      }await ee()
    }catch(e){
      alert(`重置失敗：`+e.message)
    }
  },
  ie=async(e,
  t,
  r,
  i,
  a,
  o)=>{
    if(window.confirm(`確定要手動將學員「${
      t
    }」在世界「${
      r.replace(/\D/g,
      ``)
    }」關卡「${
      a
    }」標記為已通關嗎？\n通關模式：${
      o?`滿分通關 🌟`:`一般通關 ✅`
    }`))try{
      let s=Ep(q,
      `UserStageProgress`,
      `${
        e
      }_${
        r
      }_${
        i
      }_${
        a
      }_${
        n
      }`),
      c=new Date().toISOString();
      if(await Im(s,
      {
        playerId:e,
        worldId:r,
        stageId:parseInt(i,
        10),
        checkpointId:a,
        roundId:n,
        isPerfect:o,
        perfectClearRequired:!0,
        clearedAt:c,
        firstClearedAt:c,
        failedAttempts:0,
        retryCount:0
      },
      {
        merge:!0
      }),
      await R(`force_clear_checkpoint`,
      {
        playerId:e,
        studentNickname:t,
        worldId:r,
        stageId:i,
        checkpointId:a,
        roundId:n,
        isPerfect:o
      }),
      await B(e,
      n),
      alert(`✅ 已手動設定通關！`),
      j&&j.playerId===e){
        let t=await Pm(Ep(q,
        `PlayerCompetitionProgress`,
        `${
          e
        }_${
          n
        }`));
        t.exists()&&M(t.data())
      }await ee()
    }catch(e){
      alert(`設定失敗：`+e.message)
    }
  },
  ae=i.filter(e=>{
    if(f!==`All`&&(e.farthestWorldOrder||0)!==(parseInt(f.replace(/\D/g,
    ``),
    10)||0)||m!==`All`&&(e.farthestStageIndex||0)!==parseInt(m,
    10))return!1;
    if(g!==`All`){
      let t=!!e.targetReachedAt;
      if(g===`Yes`&&!t||g===`No`&&t)return!1
    }let t=te(c[
      e.playerId
    ]||[
      
    ])>=1;
    if(y!==`All`&&(y===`Yes`&&!t||y===`No`&&t))return!1;
    let n=ne(e)===`7天未登入`;
    if(x!==`All`&&(x===`Yes`&&!n||x===`No`&&n))return!1;
    let r=re(e);
    if(C!==``&&r<parseFloat(C)||T!==``&&r>parseFloat(T))return!1;
    let i=e.failedAttemptCount||0;
    return!(D!==``&&i<parseInt(D,
    10)||k!==``&&i>parseInt(k,
    10))
  }),
  H=()=>[
    ...ae
  ].sort((e,
  t)=>{
    let n=!!e.targetReachedAt,
    r=!!t.targetReachedAt;
    if(n&&!r)return-1;
    if(!n&&r)return 1;
    if(n&&r){
      let n=new Date(e.targetReachedAt).getTime(),
      r=new Date(t.targetReachedAt).getTime();
      if(n!==r)return n-r;
      let i=e.failedAttemptCount||0,
      a=t.failedAttemptCount||0;
      if(i!==a)return i-a;
      let o=e.retryCount||0,
      s=t.retryCount||0;
      if(o!==s)return o-s;
      let c=re(e),
      l=re(t);
      return c===l?(e.userCreatedAt?new Date(e.userCreatedAt).getTime():0)-(t.userCreatedAt?new Date(t.userCreatedAt).getTime():0):l-c
    }else{
      if(e.farthestWorldOrder!==t.farthestWorldOrder)return t.farthestWorldOrder-e.farthestWorldOrder;
      if(e.farthestStageIndex!==t.farthestStageIndex)return t.farthestStageIndex-e.farthestStageIndex;
      if(e.farthestCheckpointIndex!==t.farthestCheckpointIndex)return t.farthestCheckpointIndex-e.farthestCheckpointIndex;
      let n=e.perfectClearCount||0,
      r=t.perfectClearCount||0;
      if(n!==r)return r-n;
      let i=e.lastUpdatedAt?new Date(e.lastUpdatedAt).getTime():0;
      return(t.lastUpdatedAt?new Date(t.lastUpdatedAt).getTime():0)-i
    }
  });
  return(0,
  Q.jsxs)(`div`,
  {
    className:`animate-fade-in`,
    style:{
      width:`100%`
    },
    children:[
      (0,
      Q.jsx)(`h3`,
      {
        style:{
          marginBottom:`1.5rem`,
          color:`var(--primary-dark)`,
          display:`flex`,
          alignItems:`center`,
          gap:`0.5rem`
        },
        children:`📊 學員學習進度與指標`
      }),
      (0,
      Q.jsxs)(`div`,
      {
        className:`glass-panel`,
        style:{
          padding:`1.5rem`,
          borderRadius:`16px`,
          marginBottom:`2rem`,
          display:`flex`,
          flexDirection:`column`,
          gap:`1rem`,
          background:`#fff`,
          border:`1px solid #e0e0e0`
        },
        children:[
          (0,
          Q.jsxs)(`div`,
          {
            style:{
              display:`grid`,
              gridTemplateColumns:`repeat(auto-fill,
               minmax(200px,
               1fr))`,
              gap:`1rem`
            },
            children:[
              (0,
              Q.jsxs)(`div`,
              {
                children:[
                  (0,
                  Q.jsx)(`label`,
                  {
                    style:{
                      fontSize:`0.85rem`,
                      fontWeight:`bold`,
                      color:`#555`
                    },
                    children:`挑戰輪次`
                  }),
                  (0,
                  Q.jsx)(`select`,
                  {
                    className:`input-field`,
                    style:{
                      width:`100%`,
                      marginBottom:0
                    },
                    value:n,
                    onChange:e=>r(e.target.value),
                    children:t.map(e=>(0,
                    Q.jsxs)(`option`,
                    {
                      value:e.id,
                      children:[
                        `世界 `,
                        e.worldId?e.worldId.replace(/\D/g,
                        ``):``,
                        ` - 輪次 `,
                        e.roundVersion,
                        ` (`,
                        e.targetDescription||`無目標`,
                        `)`
                      ]
                    },
                    e.id))
                  })
                ]
              }),
              (0,
              Q.jsxs)(`div`,
              {
                children:[
                  (0,
                  Q.jsx)(`label`,
                  {
                    style:{
                      fontSize:`0.85rem`,
                      fontWeight:`bold`,
                      color:`#555`
                    },
                    children:`篩選世界圖`
                  }),
                  (0,
                  Q.jsxs)(`select`,
                  {
                    className:`input-field`,
                    style:{
                      width:`100%`,
                      marginBottom:0
                    },
                    value:f,
                    onChange:e=>{
                      p(e.target.value),
                      h(`All`)
                    },
                    children:[
                      (0,
                      Q.jsx)(`option`,
                      {
                        value:`All`,
                        children:`全部世界`
                      }),
                      e.map(e=>(0,
                      Q.jsx)(`option`,
                      {
                        value:e.id,
                        children:e.name
                      },
                      e.id))
                    ]
                  })
                ]
              }),
              (0,
              Q.jsxs)(`div`,
              {
                children:[
                  (0,
                  Q.jsx)(`label`,
                  {
                    style:{
                      fontSize:`0.85rem`,
                      fontWeight:`bold`,
                      color:`#555`
                    },
                    children:`篩選階段`
                  }),
                  (0,
                  Q.jsxs)(`select`,
                  {
                    className:`input-field`,
                    style:{
                      width:`100%`,
                      marginBottom:0
                    },
                    value:m,
                    onChange:e=>h(e.target.value),
                    disabled:f===`All`,
                    children:[
                      (0,
                      Q.jsx)(`option`,
                      {
                        value:`All`,
                        children:`全部階段`
                      }),
                      Array.from({
                        length:10
                      },
                      (e,
                      t)=>(0,
                      Q.jsxs)(`option`,
                      {
                        value:t+1,
                        children:[
                          `階段 `,
                          t+1
                        ]
                      },
                      t+1))
                    ]
                  })
                ]
              }),
              (0,
              Q.jsxs)(`div`,
              {
                children:[
                  (0,
                  Q.jsx)(`label`,
                  {
                    style:{
                      fontSize:`0.85rem`,
                      fontWeight:`bold`,
                      color:`#555`
                    },
                    children:`是否達成目標`
                  }),
                  (0,
                  Q.jsxs)(`select`,
                  {
                    className:`input-field`,
                    style:{
                      width:`100%`,
                      marginBottom:0
                    },
                    value:g,
                    onChange:e=>_(e.target.value),
                    children:[
                      (0,
                      Q.jsx)(`option`,
                      {
                        value:`All`,
                        children:`全部學員`
                      }),
                      (0,
                      Q.jsx)(`option`,
                      {
                        value:`Yes`,
                        children:`已達成`
                      }),
                      (0,
                      Q.jsx)(`option`,
                      {
                        value:`No`,
                        children:`未達成`
                      })
                    ]
                  })
                ]
              }),
              (0,
              Q.jsxs)(`div`,
              {
                children:[
                  (0,
                  Q.jsx)(`label`,
                  {
                    style:{
                      fontSize:`0.85rem`,
                      fontWeight:`bold`,
                      color:`#555`
                    },
                    children:`本週是否活躍`
                  }),
                  (0,
                  Q.jsxs)(`select`,
                  {
                    className:`input-field`,
                    style:{
                      width:`100%`,
                      marginBottom:0
                    },
                    value:y,
                    onChange:e=>b(e.target.value),
                    children:[
                      (0,
                      Q.jsx)(`option`,
                      {
                        value:`All`,
                        children:`全部學員`
                      }),
                      (0,
                      Q.jsx)(`option`,
                      {
                        value:`Yes`,
                        children:`活躍`
                      }),
                      (0,
                      Q.jsx)(`option`,
                      {
                        value:`No`,
                        children:`不活躍`
                      })
                    ]
                  })
                ]
              }),
              (0,
              Q.jsxs)(`div`,
              {
                children:[
                  (0,
                  Q.jsx)(`label`,
                  {
                    style:{
                      fontSize:`0.85rem`,
                      fontWeight:`bold`,
                      color:`#555`
                    },
                    children:`7 天未登入`
                  }),
                  (0,
                  Q.jsxs)(`select`,
                  {
                    className:`input-field`,
                    style:{
                      width:`100%`,
                      marginBottom:0
                    },
                    value:x,
                    onChange:e=>S(e.target.value),
                    children:[
                      (0,
                      Q.jsx)(`option`,
                      {
                        value:`All`,
                        children:`全部學員`
                      }),
                      (0,
                      Q.jsx)(`option`,
                      {
                        value:`Yes`,
                        children:`是`
                      }),
                      (0,
                      Q.jsx)(`option`,
                      {
                        value:`No`,
                        children:`否`
                      })
                    ]
                  })
                ]
              })
            ]
          }),
          (0,
          Q.jsxs)(`div`,
          {
            style:{
              display:`grid`,
              gridTemplateColumns:`repeat(auto-fill,
               minmax(200px,
               1fr))`,
              gap:`1rem`,
              borderTop:`1px dashed #eee`,
              paddingTop:`1rem`
            },
            children:[
              (0,
              Q.jsxs)(`div`,
              {
                children:[
                  (0,
                  Q.jsx)(`label`,
                  {
                    style:{
                      fontSize:`0.85rem`,
                      fontWeight:`bold`,
                      color:`#555`
                    },
                    children:`滿分通關率範圍 (%)`
                  }),
                  (0,
                  Q.jsxs)(`div`,
                  {
                    style:{
                      display:`flex`,
                      gap:`0.5rem`,
                      alignItems:`center`
                    },
                    children:[
                      (0,
                      Q.jsx)(`input`,
                      {
                        type:`number`,
                        placeholder:`最小`,
                        className:`input-field`,
                        style:{
                          width:`100%`,
                          marginBottom:0
                        },
                        value:C,
                        onChange:e=>w(e.target.value)
                      }),
                      (0,
                      Q.jsx)(`span`,
                      {
                        children:`~`
                      }),
                      (0,
                      Q.jsx)(`input`,
                      {
                        type:`number`,
                        placeholder:`最大`,
                        className:`input-field`,
                        style:{
                          width:`100%`,
                          marginBottom:0
                        },
                        value:T,
                        onChange:e=>E(e.target.value)
                      })
                    ]
                  })
                ]
              }),
              (0,
              Q.jsxs)(`div`,
              {
                children:[
                  (0,
                  Q.jsx)(`label`,
                  {
                    style:{
                      fontSize:`0.85rem`,
                      fontWeight:`bold`,
                      color:`#555`
                    },
                    children:`失敗挑戰次數範圍`
                  }),
                  (0,
                  Q.jsxs)(`div`,
                  {
                    style:{
                      display:`flex`,
                      gap:`0.5rem`,
                      alignItems:`center`
                    },
                    children:[
                      (0,
                      Q.jsx)(`input`,
                      {
                        type:`number`,
                        placeholder:`最小`,
                        className:`input-field`,
                        style:{
                          width:`100%`,
                          marginBottom:0
                        },
                        value:D,
                        onChange:e=>O(e.target.value)
                      }),
                      (0,
                      Q.jsx)(`span`,
                      {
                        children:`~`
                      }),
                      (0,
                      Q.jsx)(`input`,
                      {
                        type:`number`,
                        placeholder:`最大`,
                        className:`input-field`,
                        style:{
                          width:`100%`,
                          marginBottom:0
                        },
                        value:k,
                        onChange:e=>A(e.target.value)
                      })
                    ]
                  })
                ]
              }),
              (0,
              Q.jsx)(`div`,
              {
                style:{
                  display:`flex`,
                  alignItems:`flex-end`,
                  justifyContent:`flex-end`
                },
                children:(0,
                Q.jsx)(`button`,
                {
                  onClick:()=>{
                    p(`All`),
                    h(`All`),
                    _(`All`),
                    b(`All`),
                    S(`All`),
                    w(``),
                    E(``),
                    O(``),
                    A(``)
                  },
                  style:{
                    padding:`0.75rem 1.5rem`,
                    background:`#f5f5f5`,
                    border:`1px solid #ccc`,
                    borderRadius:`8px`,
                    cursor:`pointer`,
                    fontWeight:`bold`
                  },
                  children:`重置篩選`
                })
              })
            ]
          })
        ]
      }),
      (0,
      Q.jsxs)(`div`,
      {
        style:{
          display:`flex`,
          gap:`1rem`,
          flexWrap:`wrap`,
          marginBottom:`1.5rem`
        },
        children:[
          (0,
          Q.jsxs)(`button`,
          {
            onClick:()=>{
              let e=ae.map(e=>({
                學員代碼:e.anonymizedStudentCode||`STU-${
                  e.playerId.substring(0,
                  6).toUpperCase()
                }`,
                顯示名稱:e.nickname||e.displayName||`未知`,
                Email:e.email||`無`,
                目前世界:e.farthestWorldOrder||0,
                目前階段:e.farthestStageIndex||0,
                "目前 Checkpoint":e.farthestCheckpointId||`-`,
                "總通關 Checkpoint 數":o[
                  e.playerId
                ]?.clearedCount||0,
                滿分通關數:e.perfectClearCount||0,
                失敗挑戰次數:e.failedAttemptCount||0,
                重試次數:e.retryCount||0,
                滿分通關率:z(e),
                是否達成目標:e.targetReachedAt?`是`:`否`,
                目標達成時間:e.targetReachedAt?new Date(e.targetReachedAt).toLocaleString():`-`,
                最後活動時間:e.lastUpdatedAt?new Date(e.lastUpdatedAt).toLocaleString():`-`,
                本週學習天數:te(c[
                  e.playerId
                ]),
                目前狀態:ne(e)
              })),
              t=yH.json_to_sheet(e),
              r=yH.book_new();
              yH.book_append_sheet(r,
              t,
              `學員學習進度`),
              $V(r,
              `student_progress_round_${
                n
              }.xlsx`)
            },
            style:{
              display:`flex`,
              alignItems:`center`,
              gap:`0.4rem`,
              padding:`0.8rem 1.2rem`,
              background:`var(--primary-color)`,
              color:`white`,
              border:`none`,
              borderRadius:`8px`,
              cursor:`pointer`,
              fontWeight:`bold`
            },
            children:[
              (0,
              Q.jsx)(YH,
              {
                size:18
              }),
              ` 匯出進度 CSV`
            ]
          }),
          (0,
          Q.jsxs)(`button`,
          {
            onClick:()=>{
              let e=H().map((e,
              t)=>({
                名次:t+1,
                學員代碼:e.anonymizedStudentCode||`STU-${
                  e.playerId.substring(0,
                  6).toUpperCase()
                }`,
                顯示名稱:e.nickname||e.displayName||`未知`,
                Email:e.email||`無`,
                是否達成目標:e.targetReachedAt?`是`:`否`,
                最遠進度:`世界 ${
                  e.farthestWorldOrder||0
                } - 階段 ${
                  e.farthestStageIndex||0
                }`,
                滿分通關數:e.perfectClearCount||0,
                失敗挑戰次數:e.failedAttemptCount||0,
                重試次數:e.retryCount||0,
                達成時間:e.targetReachedAt?new Date(e.targetReachedAt).toLocaleString():`-`
              })),
              t=yH.json_to_sheet(e),
              r=yH.book_new();
              yH.book_append_sheet(r,
              t,
              `學員競賽排名`),
              $V(r,
              `student_ranking_round_${
                n
              }.xlsx`)
            },
            style:{
              display:`flex`,
              alignItems:`center`,
              gap:`0.4rem`,
              padding:`0.8rem 1.2rem`,
              background:`#ef6c00`,
              color:`white`,
              border:`none`,
              borderRadius:`8px`,
              cursor:`pointer`,
              fontWeight:`bold`
            },
            children:[
              (0,
              Q.jsx)(CU,
              {
                size:18
              }),
              ` 匯出排名 CSV`
            ]
          }),
          (0,
          Q.jsxs)(`button`,
          {
            onClick:()=>{
              let e=ae.filter(e=>ne(e)===`7天未登入`).map(e=>({
                學員代碼:e.anonymizedStudentCode||`STU-${
                  e.playerId.substring(0,
                  6).toUpperCase()
                }`,
                顯示名稱:e.nickname||e.displayName||`未知`,
                Email:e.email||`無`,
                最後活動時間:e.lastUpdatedAt?new Date(e.lastUpdatedAt).toLocaleString():`無紀錄`,
                目前狀態:`7天以上未登入`
              })),
              t=yH.json_to_sheet(e),
              r=yH.book_new();
              yH.book_append_sheet(r,
              t,
              `未活躍學員`),
              $V(r,
              `inactive_students_round_${
                n
              }.xlsx`)
            },
            style:{
              display:`flex`,
              alignItems:`center`,
              gap:`0.4rem`,
              padding:`0.8rem 1.2rem`,
              background:`#c62828`,
              color:`white`,
              border:`none`,
              borderRadius:`8px`,
              cursor:`pointer`,
              fontWeight:`bold`
            },
            children:[
              (0,
              Q.jsx)(TU,
              {
                size:18
              }),
              ` 匯出未活躍學員 CSV`
            ]
          }),
          (0,
          Q.jsx)(`button`,
          {
            onClick:async()=>{
              if(!window.confirm(`確定要對所有未去識別化的舊學員帳號進行身份去識別化遷移嗎？
這將為所有舊學員生成唯一的去識別化代碼 (例如 S0001,
               S0002)，並保證其歷史進度不受影響。`))return;
              let e=prompt(`請輸入管理員密碼以授權進行去識別化遷移：`);
              if(e){
                d(!0);
                try{
                  let t=0,
                  n=!1;
                  try{
                    let r=window.location.hostname===`localhost`?`http://localhost:3001`:`https://live-quiz-game1.onrender.com`,
                    i=await fetch(`${
                      r
                    }/api/admin/login`,
                    {
                      method:`POST`,
                      headers:{
                        "Content-Type":`application/json`
                      },
                      body:JSON.stringify({
                        password:e
                      })
                    });
                    if(i.ok){
                      let e=(await i.json()).token,
                      a=await fetch(`${
                        r
                      }/api/admin/migrate-users`,
                      {
                        method:`POST`,
                        headers:{
                          "Content-Type":`application/json`,
                          Authorization:`Bearer ${
                            e
                          }`
                        }
                      });
                      a.ok&&(t=(await a.json()).migratedCount,
                      n=!0,
                      console.log(`Backend migration completed. Migrated: ${
                        t
                      }`))
                    }
                  }catch(e){
                    console.warn(`Backend migration failed/unavailable,
                     falling back to client-side transaction:`,
                    e)
                  }if(!n){
                    let e=await Fm(Tp(q,
                    `Users`)),
                    n=Ep(q,
                    `SystemCounters`,
                    `user_counter`);
                    for(let r of e.docs){
                      let e=r.data();
                      if(!e.anonymizedStudentCode&&e.role!==`teacher`){
                        let i=await Fm(hm(Tp(q,
                        `PlayerCompetitionProgress`),
                        _m(`playerId`,
                        `==`,
                        r.id)));
                        await Nm(q,
                        async t=>{
                          let a=await t.get(n),
                          o=0;
                          a.exists()&&(o=a.data().currentNumber||0);
                          let s=o+1,
                          c=`S`+String(s).padStart(4,
                          `0`);
                          t.update(r.ref,
                          {
                            anonymizedStudentNumber:s,
                            anonymizedStudentCode:c,
                            avatarType:e.avatar||`🧑‍🚀`,
                            updatedAt:new Date().toISOString()
                          }),
                          i.forEach(n=>{
                            t.update(n.ref,
                            {
                              anonymizedStudentCode:c,
                              allowPublicDisplayName:!!e.allowPublicDisplayName
                            })
                          }),
                          t.set(n,
                          {
                            currentNumber:s
                          })
                        }),
                        t++
                      }
                    }
                  }alert(`✅ 帳號去識別化遷移完成！成功遷移 ${
                    t
                  } 個帳號。`),
                  await ee()
                }catch(e){
                  console.error(e),
                  alert(`遷移失敗：`+e.message)
                }finally{
                  d(!1)
                }
              }
            },
            style:{
              display:`flex`,
              alignItems:`center`,
              gap:`0.4rem`,
              padding:`0.8rem 1.2rem`,
              background:`#7b1fa2`,
              color:`white`,
              border:`none`,
              borderRadius:`8px`,
              cursor:`pointer`,
              fontWeight:`bold`
            },
            children:`🔄 舊帳號去識別化遷移`
          }),
          (0,
          Q.jsxs)(`button`,
          {
            onClick:ee,
            style:{
              display:`flex`,
              alignItems:`center`,
              gap:`0.4rem`,
              padding:`0.8rem 1.2rem`,
              background:`#f5f5f5`,
              color:`#333`,
              border:`1px solid #ccc`,
              borderRadius:`8px`,
              cursor:`pointer`,
              fontWeight:`bold`,
              marginLeft:`auto`
            },
            children:[
              (0,
              Q.jsx)(pU,
              {
                size:18
              }),
              ` 重新整理`
            ]
          })
        ]
      }),
      u?(0,
      Q.jsx)(`div`,
      {
        style:{
          textAlign:`center`,
          padding:`3rem`,
          fontSize:`1.2rem`,
          color:`#888`
        },
        children:`載入數據中...`
      }):ae.length===0?(0,
      Q.jsx)(`div`,
      {
        style:{
          textAlign:`center`,
          padding:`3rem`,
          color:`#777`,
          background:`white`,
          borderRadius:`12px`,
          border:`1px solid #ddd`
        },
        children:`沒有符合篩選條件的學員進度。`
      }):(0,
      Q.jsx)(`div`,
      {
        style:{
          overflowX:`auto`,
          background:`white`,
          borderRadius:`12px`,
          boxShadow:`0 4px 12px rgba(0,
          0,
          0,
          0.05)`,
          border:`1px solid #e0e0e0`
        },
        children:(0,
        Q.jsxs)(`table`,
        {
          style:{
            width:`100%`,
            borderCollapse:`collapse`,
            textAlign:`left`,
            minWidth:`1600px`
          },
          children:[
            (0,
            Q.jsx)(`thead`,
            {
              children:(0,
              Q.jsxs)(`tr`,
              {
                style:{
                  background:`#f5f7fa`,
                  borderBottom:`2px solid #cfd8dc`
                },
                children:[
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`學員代碼`
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`顯示名稱`
                  }),
                  (0,
                  Q.jsxs)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:[
                      `信箱`,
                      (0,
                      Q.jsx)(`button`,
                      {
                        onClick:()=>{
                          let e=ae.some(e=>!F[
                            e.playerId
                          ]),
                          t={
                            
                          };
                          ae.forEach(n=>t[
                            n.playerId
                          ]=e),
                          I(t),
                          e&&R(`reveal_all_student_emails`,
                          {
                            studentCount:ae.length
                          })
                        },
                        style:{
                          marginLeft:`0.5rem`,
                          padding:`0.2rem 0.5rem`,
                          fontSize:`0.75rem`,
                          background:`#eee`,
                          border:`none`,
                          borderRadius:`4px`,
                          cursor:`pointer`
                        },
                        children:ae.some(e=>!F[
                          e.playerId
                        ])?`顯示全部`:`隱藏全部`
                      })
                    ]
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`目前世界圖`
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`目前階段`
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`目前 Checkpoint`
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`總通關 Checkpoint 數`
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`滿分通關數`
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`失敗挑戰次數`
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`重試次數`
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`滿分通關率`
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`達成目標`
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`目標達成時間`
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`最後活動時間`
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`本週學習天數`
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`目前狀態`
                  }),
                  (0,
                  Q.jsx)(`th`,
                  {
                    style:{
                      padding:`1rem`,
                      color:`var(--text-muted)`
                    },
                    children:`操作`
                  })
                ]
              })
            }),
            (0,
            Q.jsx)(`tbody`,
            {
              children:ae.map(e=>{
                let t=e.playerId,
                n=te(c[
                  t
                ]||[
                  
                ]),
                r=z(e),
                i=ne(e),
                a=e.email?F[
                  t
                ]?e.email:e.email.replace(/(.{2})(.*)(@.*)/,
                `$1***$3`):`無信箱`;
                return(0,
                Q.jsxs)(`tr`,
                {
                  style:{
                    borderBottom:`1px solid #eceff1`
                  },
                  children:[
                    (0,
                    Q.jsx)(`td`,
                    {
                      style:{
                        padding:`1rem`,
                        fontWeight:`bold`
                      },
                      children:e.anonymizedStudentCode||`STU-${
                        t.substring(0,
                        6).toUpperCase()
                      }`
                    }),
                    (0,
                    Q.jsx)(`td`,
                    {
                      style:{
                        padding:`1rem`,
                        fontWeight:`bold`,
                        color:`var(--primary-dark)`
                      },
                      children:e.nickname||e.displayName||`未知`
                    }),
                    (0,
                    Q.jsx)(`td`,
                    {
                      style:{
                        padding:`1rem`
                      },
                      children:(0,
                      Q.jsxs)(`div`,
                      {
                        style:{
                          display:`flex`,
                          alignItems:`center`,
                          gap:`0.5rem`
                        },
                        children:[
                          (0,
                          Q.jsx)(`span`,
                          {
                            style:{
                              fontSize:`0.9rem`,
                              color:`#555`
                            },
                            children:a
                          }),
                          e.email&&(0,
                          Q.jsx)(`button`,
                          {
                            onClick:()=>{
                              let n=!F[
                                t
                              ];
                              I(e=>({
                                ...e,
                                [
                                  t
                                ]:n
                              })),
                              n&&R(`reveal_student_email`,
                              {
                                playerId:t,
                                studentNickname:e.nickname||e.displayName||`未知`
                              })
                            },
                            style:{
                              padding:`0.2rem`,
                              background:`transparent`,
                              border:`none`,
                              cursor:`pointer`,
                              display:`flex`,
                              alignItems:`center`
                            },
                            children:F[
                              t
                            ]?(0,
                            Q.jsx)(ZH,
                            {
                              size:14
                            }):(0,
                            Q.jsx)(QH,
                            {
                              size:14
                            })
                          })
                        ]
                      })
                    }),
                    (0,
                    Q.jsxs)(`td`,
                    {
                      style:{
                        padding:`1rem`,
                        textAlign:`center`
                      },
                      children:[
                        `世界 `,
                        e.farthestWorldOrder||0
                      ]
                    }),
                    (0,
                    Q.jsxs)(`td`,
                    {
                      style:{
                        padding:`1rem`,
                        textAlign:`center`
                      },
                      children:[
                        `階段 `,
                        e.farthestStageIndex||0
                      ]
                    }),
                    (0,
                    Q.jsx)(`td`,
                    {
                      style:{
                        padding:`1rem`
                      },
                      children:e.farthestCheckpointId||`-`
                    }),
                    (0,
                    Q.jsx)(`td`,
                    {
                      style:{
                        padding:`1rem`,
                        textAlign:`center`,
                        fontWeight:`bold`
                      },
                      children:o[
                        t
                      ]?.clearedCount||0
                    }),
                    (0,
                    Q.jsx)(`td`,
                    {
                      style:{
                        padding:`1rem`,
                        textAlign:`center`,
                        color:`#fbc02d`,
                        fontWeight:`bold`
                      },
                      children:e.perfectClearCount||0
                    }),
                    (0,
                    Q.jsx)(`td`,
                    {
                      style:{
                        padding:`1rem`,
                        textAlign:`center`,
                        color:`#d32f2f`
                      },
                      children:e.failedAttemptCount||0
                    }),
                    (0,
                    Q.jsx)(`td`,
                    {
                      style:{
                        padding:`1rem`,
                        textAlign:`center`,
                        color:`#1976d2`
                      },
                      children:e.retryCount||0
                    }),
                    (0,
                    Q.jsx)(`td`,
                    {
                      style:{
                        padding:`1rem`,
                        textAlign:`center`,
                        fontWeight:`bold`
                      },
                      children:r
                    }),
                    (0,
                    Q.jsx)(`td`,
                    {
                      style:{
                        padding:`1rem`,
                        textAlign:`center`
                      },
                      children:e.targetReachedAt?(0,
                      Q.jsx)(`span`,
                      {
                        style:{
                          background:`#e8f5e9`,
                          color:`#2e7d32`,
                          padding:`0.2rem 0.6rem`,
                          borderRadius:`12px`,
                          fontSize:`0.8rem`,
                          fontWeight:`bold`
                        },
                        children:`已達成`
                      }):(0,
                      Q.jsx)(`span`,
                      {
                        style:{
                          background:`#ffebee`,
                          color:`#c62828`,
                          padding:`0.2rem 0.6rem`,
                          borderRadius:`12px`,
                          fontSize:`0.8rem`,
                          fontWeight:`bold`
                        },
                        children:`未達成`
                      })
                    }),
                    (0,
                    Q.jsx)(`td`,
                    {
                      style:{
                        padding:`1rem`,
                        fontSize:`0.85rem`
                      },
                      children:e.targetReachedAt?new Date(e.targetReachedAt).toLocaleString():`-`
                    }),
                    (0,
                    Q.jsx)(`td`,
                    {
                      style:{
                        padding:`1rem`,
                        fontSize:`0.85rem`
                      },
                      children:e.lastUpdatedAt?new Date(e.lastUpdatedAt).toLocaleString():`-`
                    }),
                    (0,
                    Q.jsxs)(`td`,
                    {
                      style:{
                        padding:`1rem`,
                        textAlign:`center`,
                        fontWeight:`bold`
                      },
                      children:[
                        n,
                        ` 天`
                      ]
                    }),
                    (0,
                    Q.jsxs)(`td`,
                    {
                      style:{
                        padding:`1rem`
                      },
                      children:[
                        i===`活躍`&&(0,
                        Q.jsx)(`span`,
                        {
                          style:{
                            background:`#e8f5e9`,
                            color:`#2e7d32`,
                            padding:`0.2rem 0.6rem`,
                            borderRadius:`12px`,
                            fontSize:`0.8rem`,
                            fontWeight:`bold`
                          },
                          children:`活躍`
                        }),
                        i===`閒置`&&(0,
                        Q.jsx)(`span`,
                        {
                          style:{
                            background:`#fff3e0`,
                            color:`#ef6c00`,
                            padding:`0.2rem 0.6rem`,
                            borderRadius:`12px`,
                            fontSize:`0.8rem`,
                            fontWeight:`bold`
                          },
                          children:`閒置`
                        }),
                        i===`7天未登入`&&(0,
                        Q.jsx)(`span`,
                        {
                          style:{
                            background:`#ffebee`,
                            color:`#c62828`,
                            padding:`0.2rem 0.6rem`,
                            borderRadius:`12px`,
                            fontSize:`0.8rem`,
                            fontWeight:`bold`
                          },
                          children:`7天未登入`
                        })
                      ]
                    }),
                    (0,
                    Q.jsx)(`td`,
                    {
                      style:{
                        padding:`1rem`
                      },
                      children:(0,
                      Q.jsxs)(`button`,
                      {
                        onClick:()=>{
                          M(e),
                          P(`map`),
                          R(`view_student_details`,
                          {
                            playerId:t,
                            studentNickname:e.nickname||e.displayName||`未知`
                          })
                        },
                        style:{
                          padding:`0.4rem 0.8rem`,
                          background:`var(--primary-color)`,
                          color:`white`,
                          border:`none`,
                          borderRadius:`6px`,
                          cursor:`pointer`,
                          fontWeight:`bold`,
                          display:`flex`,
                          alignItems:`center`,
                          gap:`0.3rem`
                        },
                        children:[
                          (0,
                          Q.jsx)(mU,
                          {
                            size:14
                          }),
                          ` 詳細`
                        ]
                      })
                    })
                  ]
                },
                e.id)
              })
            })
          ]
        })
      }),
      j&&(0,
      Q.jsx)(`div`,
      {
        style:{
          position:`fixed`,
          top:0,
          left:0,
          right:0,
          bottom:0,
          background:`rgba(0,
           0,
           0,
           0.6)`,
          backdropFilter:`blur(4px)`,
          display:`flex`,
          justifyContent:`center`,
          alignItems:`center`,
          zIndex:1e3,
          padding:`2rem`
        },
        onClick:()=>M(null),
        children:(0,
        Q.jsxs)(`div`,
        {
          style:{
            background:`#ffffff`,
            borderRadius:`24px`,
            width:`100%`,
            maxHeight:`90vh`,
            overflow:`hidden`,
            boxShadow:`0 20px 40px rgba(0,
             0,
             0,
             0.2)`,
            position:`relative`,
            display:`flex`,
            flexDirection:`column`,
            maxWidth:`1000px`
          },
          onClick:e=>e.stopPropagation(),
          children:[
            (0,
            Q.jsxs)(`div`,
            {
              style:{
                display:`flex`,
                justifyContent:`space-between`,
                alignItems:`center`,
                padding:`1.5rem 2rem`,
                borderBottom:`1px solid #eee`,
                background:`var(--primary-dark)`,
                color:`white`,
                borderRadius:`24px 24px 0 0`
              },
              children:[
                (0,
                Q.jsxs)(`div`,
                {
                  children:[
                    (0,
                    Q.jsxs)(`h3`,
                    {
                      style:{
                        fontSize:`1.6rem`,
                        fontWeight:`bold`,
                        margin:0
                      },
                      children:[
                        `🎓 學員詳細歷程: `,
                        j.nickname||j.displayName||`未知`
                      ]
                    }),
                    (0,
                    Q.jsxs)(`p`,
                    {
                      style:{
                        margin:`0.2rem 0 0 0`,
                        fontSize:`0.9rem`,
                        opacity:.85
                      },
                      children:[
                        `學員代碼: `,
                        j.anonymizedStudentCode||`STU-${
                          j.playerId.substring(0,
                          6).toUpperCase()
                        }`,
                        ` | 信箱: `,
                        j.email||`無`
                      ]
                    })
                  ]
                }),
                (0,
                Q.jsx)(`button`,
                {
                  onClick:()=>M(null),
                  style:{
                    background:`rgba(255,
                    255,
                    255,
                    0.2)`,
                    border:`none`,
                    color:`white`,
                    width:`36px`,
                    height:`36px`,
                    borderRadius:`50%`,
                    cursor:`pointer`,
                    display:`flex`,
                    alignItems:`center`,
                    justifyContent:`center`,
                    fontWeight:`bold`,
                    fontSize:`1.2rem`
                  },
                  children:(0,
                  Q.jsx)(EU,
                  {
                    size:18
                  })
                })
              ]
            }),
            (0,
            Q.jsxs)(`div`,
            {
              style:{
                padding:`2rem`,
                display:`flex`,
                flexDirection:`column`,
                gap:`1.5rem`,
                flex:1,
                overflowY:`auto`
              },
              children:[
                (0,
                Q.jsx)(`div`,
                {
                  style:{
                    display:`flex`,
                    gap:`0.5rem`,
                    borderBottom:`2px solid #eee`,
                    paddingBottom:`0.5rem`,
                    flexWrap:`wrap`
                  },
                  children:[
                    {
                      key:`map`,
                      label:`🗺️ 進度地圖`,
                      icon:(0,
                      Q.jsx)(cU,
                      {
                        size:16
                      })
                    },
                    {
                      key:`attempts`,
                      label:`⏱️ 挑戰歷程`,
                      icon:(0,
                      Q.jsx)(WH,
                      {
                        size:16
                      })
                    },
                    {
                      key:`wrong_qs`,
                      label:`❌ 錯題彙整`,
                      icon:(0,
                      Q.jsx)($H,
                      {
                        size:16
                      })
                    },
                    {
                      key:`timeline`,
                      label:`📅 學習時間軸`,
                      icon:(0,
                      Q.jsx)(LH,
                      {
                        size:16
                      })
                    }
                  ].map(e=>(0,
                  Q.jsxs)(`button`,
                  {
                    onClick:()=>P(e.key),
                    style:{
                      display:`flex`,
                      alignItems:`center`,
                      gap:`0.4rem`,
                      padding:`0.75rem 1.25rem`,
                      border:`none`,
                      background:N===e.key?`#e8f5e9`:`transparent`,
                      color:N===e.key?`var(--primary-color)`:`#666`,
                      fontWeight:`bold`,
                      borderRadius:`8px`,
                      cursor:`pointer`,
                      borderBottom:N===e.key?`3px solid var(--primary-color)`:`none`,
                      transition:`all 0.2s`
                    },
                    children:[
                      e.icon,
                      ` `,
                      e.label
                    ]
                  },
                  e.key))
                }),
                N===`map`&&(0,
                Q.jsxs)(`div`,
                {
                  className:`animate-fade-in`,
                  style:{
                    display:`flex`,
                    flexDirection:`column`,
                    gap:`1.5rem`
                  },
                  children:[
                    (0,
                    Q.jsx)(`h4`,
                    {
                      style:{
                        color:`var(--primary-dark)`,
                        fontWeight:`bold`,
                        margin:0
                      },
                      children:`關卡解鎖進度地圖`
                    }),
                    (0,
                    Q.jsx)(`div`,
                    {
                      style:{
                        display:`flex`,
                        flexDirection:`column`,
                        gap:`1.5rem`,
                        maxHeight:`500px`,
                        overflowY:`auto`
                      },
                      children:e.filter(e=>!e.isArchived).map(e=>{
                        let t=j.playerId,
                        n=o[
                          t
                        ]?.checkpoints||{
                          
                        };
                        return(0,
                        Q.jsxs)(`div`,
                        {
                          style:{
                            border:`1px solid #cfd8dc`,
                            borderRadius:`12px`,
                            padding:`1rem`,
                            background:`#fafafa`
                          },
                          children:[
                            (0,
                            Q.jsxs)(`div`,
                            {
                              style:{
                                fontWeight:`bold`,
                                color:`var(--primary-dark)`,
                                marginBottom:`0.8rem`,
                                borderBottom:`1px solid #eee`,
                                paddingBottom:`0.4rem`
                              },
                              children:[
                                `🌐 `,
                                e.name,
                                ` (V`,
                                e.roundVersion||1,
                                `)`
                              ]
                            }),
                            (0,
                            Q.jsx)(`div`,
                            {
                              style:{
                                display:`flex`,
                                flexDirection:`column`,
                                gap:`1rem`
                              },
                              children:e.stages?.map(r=>(0,
                              Q.jsxs)(`div`,
                              {
                                style:{
                                  display:`flex`,
                                  alignItems:`center`,
                                  gap:`1rem`,
                                  flexWrap:`wrap`
                                },
                                children:[
                                  (0,
                                  Q.jsxs)(`span`,
                                  {
                                    style:{
                                      fontSize:`0.85rem`,
                                      fontWeight:`bold`,
                                      color:`white`,
                                      background:`#90a4ae`,
                                      padding:`0.2rem 0.5rem`,
                                      borderRadius:`4px`,
                                      minWidth:`70px`,
                                      textAlign:`center`
                                    },
                                    children:[
                                      `階段 `,
                                      r.id
                                    ]
                                  }),
                                  (0,
                                  Q.jsx)(`div`,
                                  {
                                    style:{
                                      display:`flex`,
                                      gap:`0.8rem`,
                                      flexWrap:`wrap`,
                                      flex:1
                                    },
                                    children:r.checkpoints?.map(i=>{
                                      let a=n[
                                        `${
                                          e.id
                                        }_${
                                          r.id
                                        }_${
                                          i.id
                                        }`
                                      ],
                                      o=!!a?.clearedAt,
                                      s=!!a?.isPerfect,
                                      c=(a?.failedAttempts||0)+(a?.retryCount||0)+ +!!o,
                                      l=`#eee`,
                                      u=`#777`,
                                      d=`🔒 已鎖定`;
                                      return o?s?(l=`#fff9c4`,
                                      u=`#b71c1c`,
                                      d=`🌟 滿分`):(l=`#e8f5e9`,
                                      u=`#2e7d32`,
                                      d=`✅ 通關`):c>0&&(l=`#ffebee`,
                                      u=`#c62828`,
                                      d=`❌ 失敗`),
                                      (0,
                                      Q.jsxs)(`div`,
                                      {
                                        style:{
                                          background:l,
                                          border:`1px solid #ddd`,
                                          borderRadius:`8px`,
                                          padding:`0.6rem 1rem`,
                                          minWidth:`180px`,
                                          display:`flex`,
                                          flexDirection:`column`,
                                          gap:`0.3rem`
                                        },
                                        children:[
                                          (0,
                                          Q.jsx)(`div`,
                                          {
                                            style:{
                                              fontSize:`0.9rem`,
                                              fontWeight:`bold`,
                                              color:`#333`
                                            },
                                            children:i.name
                                          }),
                                          (0,
                                          Q.jsxs)(`div`,
                                          {
                                            style:{
                                              fontSize:`0.75rem`,
                                              color:u,
                                              fontWeight:`bold`,
                                              display:`flex`,
                                              justifyContent:`space-between`
                                            },
                                            children:[
                                              (0,
                                              Q.jsx)(`span`,
                                              {
                                                children:d
                                              }),
                                              (0,
                                              Q.jsxs)(`span`,
                                              {
                                                children:[
                                                  c,
                                                  ` 次挑戰`
                                                ]
                                              })
                                            ]
                                          }),
                                          (0,
                                          Q.jsx)(`div`,
                                          {
                                            style:{
                                              display:`flex`,
                                              gap:`0.3rem`,
                                              marginTop:`0.4rem`,
                                              borderTop:`1px solid rgba(0,
                                              0,
                                              0,
                                              0.05)`,
                                              paddingTop:`0.4rem`
                                            },
                                            children:o?(0,
                                            Q.jsx)(`button`,
                                            {
                                              onClick:()=>V(t,
                                              j.nickname||j.displayName||`未知`,
                                              e.id,
                                              r.id,
                                              i.id),
                                              style:{
                                                flex:1,
                                                padding:`0.2rem`,
                                                fontSize:`0.75rem`,
                                                background:`#e53935`,
                                                color:`white`,
                                                border:`none`,
                                                borderRadius:`4px`,
                                                cursor:`pointer`,
                                                fontWeight:`bold`
                                              },
                                              children:`重置紀錄`
                                            }):(0,
                                            Q.jsxs)(Q.Fragment,
                                            {
                                              children:[
                                                (0,
                                                Q.jsx)(`button`,
                                                {
                                                  onClick:()=>ie(t,
                                                  j.nickname||j.displayName||`未知`,
                                                  e.id,
                                                  r.id,
                                                  i.id,
                                                  !1),
                                                  style:{
                                                    flex:1,
                                                    padding:`0.2rem`,
                                                    fontSize:`0.75rem`,
                                                    background:`#4caf50`,
                                                    color:`white`,
                                                    border:`none`,
                                                    borderRadius:`4px`,
                                                    cursor:`pointer`,
                                                    fontWeight:`bold`
                                                  },
                                                  children:`一般通關`
                                                }),
                                                (0,
                                                Q.jsx)(`button`,
                                                {
                                                  onClick:()=>ie(t,
                                                  j.nickname||j.displayName||`未知`,
                                                  e.id,
                                                  r.id,
                                                  i.id,
                                                  !0),
                                                  style:{
                                                    flex:1,
                                                    padding:`0.2rem`,
                                                    fontSize:`0.75rem`,
                                                    background:`#ffc107`,
                                                    color:`#333`,
                                                    border:`none`,
                                                    borderRadius:`4px`,
                                                    cursor:`pointer`,
                                                    fontWeight:`bold`
                                                  },
                                                  children:`滿分通關`
                                                })
                                              ]
                                            })
                                          })
                                        ]
                                      },
                                      i.id)
                                    })
                                  })
                                ]
                              },
                              r.id))
                            })
                          ]
                        },
                        e.id)
                      })
                    })
                  ]
                }),
                N===`attempts`&&(0,
                Q.jsxs)(`div`,
                {
                  className:`animate-fade-in`,
                  children:[
                    (0,
                    Q.jsx)(`h4`,
                    {
                      style:{
                        color:`var(--primary-dark)`,
                        fontWeight:`bold`,
                        marginBottom:`1rem`
                      },
                      children:`完整作答挑戰歷程`
                    }),
                    !c[
                      j.playerId
                    ]||c[
                      j.playerId
                    ].length===0?(0,
                    Q.jsx)(`p`,
                    {
                      style:{
                        color:`#777`,
                        textAlign:`center`,
                        padding:`2rem`
                      },
                      children:`尚無任何挑戰作答紀錄。`
                    }):(0,
                    Q.jsx)(`div`,
                    {
                      style:{
                        overflowX:`auto`,
                        maxHeight:`450px`
                      },
                      children:(0,
                      Q.jsxs)(`table`,
                      {
                        style:{
                          width:`100%`,
                          borderCollapse:`collapse`,
                          textAlign:`left`,
                          fontSize:`0.9rem`
                        },
                        children:[
                          (0,
                          Q.jsx)(`thead`,
                          {
                            children:(0,
                            Q.jsxs)(`tr`,
                            {
                              style:{
                                background:`#f5f7fa`,
                                borderBottom:`1px solid #cfd8dc`
                              },
                              children:[
                                (0,
                                Q.jsx)(`th`,
                                {
                                  style:{
                                    padding:`0.8rem`
                                  },
                                  children:`完成時間`
                                }),
                                (0,
                                Q.jsx)(`th`,
                                {
                                  style:{
                                    padding:`0.8rem`
                                  },
                                  children:`世界關卡`
                                }),
                                (0,
                                Q.jsx)(`th`,
                                {
                                  style:{
                                    padding:`0.8rem`
                                  },
                                  children:`檢查點 ID`
                                }),
                                (0,
                                Q.jsx)(`th`,
                                {
                                  style:{
                                    padding:`0.8rem`,
                                    textAlign:`center`
                                  },
                                  children:`挑戰次數`
                                }),
                                (0,
                                Q.jsx)(`th`,
                                {
                                  style:{
                                    padding:`0.8rem`,
                                    textAlign:`center`
                                  },
                                  children:`得分 (答對/總數)`
                                }),
                                (0,
                                Q.jsx)(`th`,
                                {
                                  style:{
                                    padding:`0.8rem`
                                  },
                                  children:`結果狀態`
                                })
                              ]
                            })
                          }),
                          (0,
                          Q.jsx)(`tbody`,
                          {
                            children:c[
                              j.playerId
                            ].sort((e,
                            t)=>new Date(t.completedAt)-new Date(e.completedAt)).map((e,
                            t)=>(0,
                            Q.jsxs)(`tr`,
                            {
                              style:{
                                borderBottom:`1px solid #eee`
                              },
                              children:[
                                (0,
                                Q.jsx)(`td`,
                                {
                                  style:{
                                    padding:`0.8rem`
                                  },
                                  children:new Date(e.completedAt).toLocaleString()
                                }),
                                (0,
                                Q.jsxs)(`td`,
                                {
                                  style:{
                                    padding:`0.8rem`,
                                    fontWeight:`bold`
                                  },
                                  children:[
                                    `世界 `,
                                    e.worldId?.replace(/\D/g,
                                    ``),
                                    ` - 階段 `,
                                    e.stageId
                                  ]
                                }),
                                (0,
                                Q.jsx)(`td`,
                                {
                                  style:{
                                    padding:`0.8rem`,
                                    fontFamily:`monospace`
                                  },
                                  children:e.checkpointId
                                }),
                                (0,
                                Q.jsxs)(`td`,
                                {
                                  style:{
                                    padding:`0.8rem`,
                                    textAlign:`center`
                                  },
                                  children:[
                                    `第 `,
                                    e.attemptNumber,
                                    ` 次`
                                  ]
                                }),
                                (0,
                                Q.jsxs)(`td`,
                                {
                                  style:{
                                    padding:`0.8rem`,
                                    textAlign:`center`,
                                    fontWeight:`bold`
                                  },
                                  children:[
                                    e.correctAnswers,
                                    ` / `,
                                    e.totalQuestions
                                  ]
                                }),
                                (0,
                                Q.jsx)(`td`,
                                {
                                  style:{
                                    padding:`0.8rem`
                                  },
                                  children:e.isPerfect?(0,
                                  Q.jsx)(`span`,
                                  {
                                    style:{
                                      color:`#fbc02d`,
                                      fontWeight:`bold`
                                    },
                                    children:`🌟 滿分挑戰成功`
                                  }):e.isCleared?(0,
                                  Q.jsx)(`span`,
                                  {
                                    style:{
                                      color:`#2e7d32`,
                                      fontWeight:`bold`
                                    },
                                    children:`✅ 通關`
                                  }):(0,
                                  Q.jsx)(`span`,
                                  {
                                    style:{
                                      color:`#d32f2f`,
                                      fontWeight:`bold`
                                    },
                                    children:`❌ 挑戰失敗`
                                  })
                                })
                              ]
                            },
                            t))
                          })
                        ]
                      })
                    })
                  ]
                }),
                N===`wrong_qs`&&(0,
                Q.jsxs)(`div`,
                {
                  className:`animate-fade-in`,
                  style:{
                    maxHeight:`500px`,
                    overflowY:`auto`
                  },
                  children:[
                    (0,
                    Q.jsx)(`h4`,
                    {
                      style:{
                        color:`var(--primary-dark)`,
                        fontWeight:`bold`,
                        marginBottom:`1rem`
                      },
                      children:`錯題本彙整 (錯題本)`
                    }),
                    (()=>{
                      let e=c[
                        j.playerId
                      ]||[
                        
                      ],
                      t=[
                        
                      ];
                      if(e.forEach(e=>{
                        e.wrongQuestions&&e.wrongQuestions.forEach(e=>{
                          t.push(e)
                        })
                      }),
                      t.length===0)return(0,
                      Q.jsx)(`p`,
                      {
                        style:{
                          color:`#777`,
                          textAlign:`center`,
                          padding:`2rem`
                        },
                        children:`🎉 恭喜！目前學員沒有任何答錯題目紀錄。`
                      });
                      let n={
                        
                      };
                      return t.forEach(e=>{
                        n[
                          e.questionText
                        ]||(n[
                          e.questionText
                        ]={
                          q:e,
                          count:0
                        }),
                        n[
                          e.questionText
                        ].count++
                      }),
                      (0,
                      Q.jsx)(`div`,
                      {
                        style:{
                          display:`flex`,
                          flexDirection:`column`,
                          gap:`1.2rem`
                        },
                        children:Object.values(n).map((e,
                        t)=>(0,
                        Q.jsxs)(`div`,
                        {
                          style:{
                            border:`1px solid #ef9a9a`,
                            borderRadius:`12px`,
                            padding:`1rem`,
                            background:`#ffebee`
                          },
                          children:[
                            (0,
                            Q.jsxs)(`div`,
                            {
                              style:{
                                display:`flex`,
                                justifyContent:`space-between`,
                                alignItems:`flex-start`,
                                marginBottom:`0.8rem`
                              },
                              children:[
                                (0,
                                Q.jsx)(`div`,
                                {
                                  style:{
                                    fontWeight:`bold`,
                                    fontSize:`1.1rem`,
                                    color:`#b71c1c`
                                  },
                                  children:e.q.questionText
                                }),
                                (0,
                                Q.jsxs)(`span`,
                                {
                                  style:{
                                    background:`#d32f2f`,
                                    color:`white`,
                                    padding:`0.2rem 0.6rem`,
                                    borderRadius:`6px`,
                                    fontSize:`0.8rem`,
                                    fontWeight:`bold`,
                                    whiteSpace:`nowrap`
                                  },
                                  children:[
                                    `答錯 `,
                                    e.count,
                                    ` 次`
                                  ]
                                })
                              ]
                            }),
                            (0,
                            Q.jsxs)(`div`,
                            {
                              style:{
                                display:`grid`,
                                gridTemplateColumns:`1fr 1fr`,
                                gap:`0.6rem`,
                                fontSize:`0.95rem`
                              },
                              children:[
                                e.q.optA&&(0,
                                Q.jsxs)(`div`,
                                {
                                  style:{
                                    padding:`0.4rem`,
                                    borderRadius:`4px`,
                                    border:`1px solid #ddd`,
                                    background:e.q.correctOption===`A`?`#c8e6c9`:e.q.selectedOption===`A`?`#ffcdd2`:`#fff`
                                  },
                                  children:[
                                    `A: `,
                                    e.q.optA,
                                    ` `,
                                    e.q.correctOption===`A`&&` (正確答案)`,
                                    ` `,
                                    e.q.selectedOption===`A`&&` (學員選此)`
                                  ]
                                }),
                                e.q.optB&&(0,
                                Q.jsxs)(`div`,
                                {
                                  style:{
                                    padding:`0.4rem`,
                                    borderRadius:`4px`,
                                    border:`1px solid #ddd`,
                                    background:e.q.correctOption===`B`?`#c8e6c9`:e.q.selectedOption===`B`?`#ffcdd2`:`#fff`
                                  },
                                  children:[
                                    `B: `,
                                    e.q.optB,
                                    ` `,
                                    e.q.correctOption===`B`&&` (正確答案)`,
                                    ` `,
                                    e.q.selectedOption===`B`&&` (學員選此)`
                                  ]
                                }),
                                e.q.optC&&(0,
                                Q.jsxs)(`div`,
                                {
                                  style:{
                                    padding:`0.4rem`,
                                    borderRadius:`4px`,
                                    border:`1px solid #ddd`,
                                    background:e.q.correctOption===`C`?`#c8e6c9`:e.q.selectedOption===`C`?`#ffcdd2`:`#fff`
                                  },
                                  children:[
                                    `C: `,
                                    e.q.optC,
                                    ` `,
                                    e.q.correctOption===`C`&&` (正確答案)`,
                                    ` `,
                                    e.q.selectedOption===`C`&&` (學員選此)`
                                  ]
                                }),
                                e.q.optD&&(0,
                                Q.jsxs)(`div`,
                                {
                                  style:{
                                    padding:`0.4rem`,
                                    borderRadius:`4px`,
                                    border:`1px solid #ddd`,
                                    background:e.q.correctOption===`D`?`#c8e6c9`:e.q.selectedOption===`D`?`#ffcdd2`:`#fff`
                                  },
                                  children:[
                                    `D: `,
                                    e.q.optD,
                                    ` `,
                                    e.q.correctOption===`D`&&` (正確答案)`,
                                    ` `,
                                    e.q.selectedOption===`D`&&` (學員選此)`
                                  ]
                                })
                              ]
                            })
                          ]
                        },
                        t))
                      })
                    })()
                  ]
                }),
                N===`timeline`&&(0,
                Q.jsxs)(`div`,
                {
                  className:`animate-fade-in`,
                  style:{
                    maxHeight:`450px`,
                    overflowY:`auto`
                  },
                  children:[
                    (0,
                    Q.jsx)(`h4`,
                    {
                      style:{
                        color:`var(--primary-dark)`,
                        fontWeight:`bold`,
                        marginBottom:`1rem`
                      },
                      children:`學習活動時間軸`
                    }),
                    (()=>{
                      let e=[
                        
                      ];
                      return(c[
                        j.playerId
                      ]||[
                        
                      ]).forEach(t=>{
                        e.push({
                          time:new Date(t.completedAt),
                          desc:`挑戰世界 ${
                            t.worldId?.replace(/\D/g,
                            ``)
                          } 階段 ${
                            t.stageId
                          } [
                            ${
                              t.checkpointId
                            }
                          ] - 得分 ${
                            t.correctAnswers
                          }/${
                            t.totalQuestions
                          } (${
                            t.isPerfect?`🌟 滿分挑戰成功`:t.isCleared?`✅ 通關`:`❌ 挑戰失敗`
                          })`,
                          icon:t.isPerfect?`🌟`:t.isCleared?`✅`:`❌`
                        })
                      }),
                      j.targetReachedAt&&e.push({
                        time:new Date(j.targetReachedAt),
                        desc:`🎉 達成輪次指定學習目標！取得第 ${
                          j.targetReachedRank||1
                        } 名`,
                        icon:`🏆`
                      }),
                      e.length===0?(0,
                      Q.jsx)(`p`,
                      {
                        style:{
                          color:`#777`,
                          textAlign:`center`,
                          padding:`2rem`
                        },
                        children:`尚無任何時間軸事件紀錄。`
                      }):(e.sort((e,
                      t)=>t.time-e.time),
                      (0,
                      Q.jsx)(`div`,
                      {
                        style:{
                          display:`flex`,
                          flexDirection:`column`,
                          gap:`1rem`,
                          borderLeft:`3px solid #ccc`,
                          paddingLeft:`1.5rem`,
                          marginLeft:`1rem`
                        },
                        children:e.map((e,
                        t)=>(0,
                        Q.jsxs)(`div`,
                        {
                          style:{
                            position:`relative`,
                            marginBottom:`1rem`
                          },
                          children:[
                            (0,
                            Q.jsx)(`div`,
                            {
                              style:{
                                position:`absolute`,
                                left:`-31px`,
                                top:`2px`,
                                background:`#fff`,
                                width:`22px`,
                                height:`22px`,
                                border:`2px solid #999`,
                                borderRadius:`50%`,
                                display:`flex`,
                                alignItems:`center`,
                                justifyContent:`center`,
                                fontSize:`0.75rem`
                              },
                              children:e.icon
                            }),
                            (0,
                            Q.jsx)(`div`,
                            {
                              style:{
                                fontSize:`0.8rem`,
                                color:`#777`
                              },
                              children:e.time.toLocaleString()
                            }),
                            (0,
                            Q.jsx)(`div`,
                            {
                              style:{
                                fontSize:`0.95rem`,
                                fontWeight:`500`,
                                color:`#333`,
                                marginTop:`0.2rem`
                              },
                              children:e.desc
                            })
                          ]
                        },
                        t))
                      }))
                    })()
                  ]
                })
              ]
            }),
            (0,
            Q.jsx)(`div`,
            {
              style:{
                display:`flex`,
                justifyContent:`flex-end`,
                padding:`1.5rem 2rem`,
                borderTop:`1px solid #eee`,
                background:`#fafafa`,
                borderRadius:`0 0 24px 24px`
              },
              children:(0,
              Q.jsx)(`button`,
              {
                onClick:()=>M(null),
                style:{
                  padding:`0.8rem 2rem`,
                  background:`#777`,
                  color:`white`,
                  border:`none`,
                  borderRadius:`8px`,
                  cursor:`pointer`,
                  fontWeight:`bold`
                },
                children:`關閉`
              })
            })
          ]
        })
      })
    ]
  })
}
export default AU;
