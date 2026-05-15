// --- 新增：切換密碼顯示狀態 ---
function togglePassword() {
    const pwdInput = document.getElementById('password');
    const toggleIcon = document.getElementById('toggle-pwd');
    
    if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        toggleIcon.innerText = '🙈'; // 切換成閉眼圖示
    } else {
        pwdInput.type = 'password';
        toggleIcon.innerText = '👁️'; // 切換回睜眼圖示
    }
}

// --- 新增：網頁載入時自動填入已記憶的帳密 ---
window.onload = function() {
    const savedName = localStorage.getItem('ad_saved_username');
    const savedPass = localStorage.getItem('ad_saved_password');
    
    if (savedName && savedPass) {
        document.getElementById('username').value = savedName;
        document.getElementById('password').value = savedPass;
        document.getElementById('remember-me').checked = true; // 將選項自動打勾
    }
};

// --- 1. Firebase 配置 (請替換為您的資訊) ---
    const firebaseConfig = {
        apiKey: "AIzaSyD-4s0k0_wyEiievNHgxmci_IepkhKMEYQ",
        authDomain: "adtest-23b18.firebaseapp.com",
        projectId: "adtest-23b18",
        storageBucket: "adtest-23b18.firebasestorage.app",
        messagingSenderId: "408042789725",
        appId: "1:408042789725:web:3168cae60dfc33c8ca26b4",
        measurementId: "G-WF5HPRPX3H",
        databaseURL: "https://adtest-23b18-default-rtdb.firebaseio.com/"
    };
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

firebase.auth().signInAnonymously()
    .then(() => {
        console.log("✅ 成功取得 Firebase 臨時訪客證！現在可以安全讀寫資料庫了。");
        // 這裡可以放你原本要在網頁載入時執行的資料庫讀取動作 (例如載入人數等)
    })
    .catch((error) => {
        console.error("❌ 匿名登入失敗：", error.code, error.message);
    });

// --- 2. 核心變數 ---
let myUid = sessionStorage.getItem('game_uid');
let myName = sessionStorage.getItem('game_username');
if (myUid) startSync();

// --- 3. 登入與註冊 ---
function login() {
    const name = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    const remember = document.getElementById('remember-me').checked; // 🌟 新增：抓取是否有打勾

    if (!name || !pass) return alert("請填寫完整帳密");

    // 去資料庫找這個名字
    db.ref('players').orderByChild('name').equalTo(name).once('value', (snap) => {
        if (snap.exists()) {
            // 帳號已存在 -> 檢查密碼
            let uid = Object.keys(snap.val())[0];
            let p = snap.val()[uid];
            
            if (p.password && p.password !== pass) {
                return alert("密碼錯誤！如果忘記密碼請找管理員。");
            }
            
            // 🌟 新增：密碼正確，處理記住我邏輯
            handleRememberMe(name, pass, remember);

            sessionStorage.setItem('game_uid', uid);
            sessionStorage.setItem('game_username', name);
            location.reload();
        } else {
            // 註冊新玩家
            const newRef = db.ref('players').push();
            newRef.set({
                name: name,
                password: pass, 
                total_points: 0
            }).then(() => {
                // 🌟 新增：註冊成功，處理記住我邏輯
                handleRememberMe(name, pass, remember);

                sessionStorage.setItem('game_uid', newRef.key);
                sessionStorage.setItem('game_username', name);
                alert("註冊成功！歡迎加入遊戲。");
                location.reload();
            });
        }
    });
}

// --- 新增：處理儲存或清除帳密的小幫手 ---
function handleRememberMe(name, pass, remember) {
    if (remember) {
        localStorage.setItem('ad_saved_username', name);
        localStorage.setItem('ad_saved_password', pass);
    } else {
        localStorage.removeItem('ad_saved_username');
        localStorage.removeItem('ad_saved_password');
    }
}

function doLogin(uid, name) {
    myUid = uid; myName = name;
    sessionStorage.setItem('game_uid', uid);
    sessionStorage.setItem('game_username', name);
    startSync();
}

// --- 4. 即時同步監聽 ---
// --- 4. 即時同步監聽 ---
function startSync() {
    db.ref('/').on('value', (snapshot) => {
        const data = snapshot.val();
        
        // 1. 如果資料庫被徹底清空，強制登出
        if (!data) {
            logout();
            return;
        }

        // 2. 確保 players 存在（如果是空的則給予空物件預設值）
        const players = data.players || {};
        const config = data.camp_config || { status: 'waiting' };
        
        // 3. 核心防呆：如果網頁覺得自己有登入 (myUid 存在)，但資料庫裡已經沒有這個人了 (被管理員重置)
        // 必須強制登出並重整，否則畫面會卡死
        if (myUid && !players[myUid]) {
            logout();
            return;
        }

        // 介面切換與資訊更新
        document.getElementById('user-bar').style.display = 'flex';
        document.getElementById('bar-username').innerText = myName;
        document.getElementById('wait-name').innerText = myName;
        document.getElementById('player-count').innerText = Object.keys(players).length;

        // 判斷是否進入遊戲畫面
        if (config.status === 'ended' && players[myUid]) {
            // 狀態 1：遊戲結束，進入結算揭曉畫面
            showScreen('end-screen');
            document.getElementById('main-header').style.display = 'none';
            document.getElementById('final-score').innerText = players[myUid].total_points || 0;

            // 關係回溯：搜尋全體玩家，找出誰的天使/惡魔目標是我
            let myAngelName = "未指派";
            let myDemonName = "未指派";
            
            for (let id in players) {
                if (players[id].identity) {
                    if (players[id].identity.angel_to === myUid) {
                        myAngelName = players[id].name;
                    }
                    if (players[id].identity.demon_to === myUid) {
                        myDemonName = players[id].name;
                    }
                }
            }
            
            // 顯示在畫面上
            document.getElementById('my-angel-reveal').innerText = myAngelName;
            document.getElementById('my-demon-reveal').innerText = myDemonName;

        } 
        else if (config.status === 'daily_settlement') {
            showScreen('daily-settle-screen');
            document.getElementById('main-header').style.display = 'none';
            
            // 🌟 新增：檢查玩家是否已經提交過拼圖
            const submitBtn = document.querySelector('#daily-settle-screen button');
            
            if (players[myUid] && players[myUid].has_submitted_checklist) {
                // 狀態 A：已經交卷 -> 隱藏題目，按鈕反灰
                const container = document.getElementById('checklist-container');
                container.innerHTML = '<div style="text-align:center; padding: 20px; color:#64748b; font-weight:bold;">你已經提交過今日的拼圖囉！<br>請靜候管理員結算。</div>';
                
                if (submitBtn) {
                    submitBtn.innerText = "今日已提交";
                    submitBtn.disabled = true;
                    submitBtn.style.background = "#94a3b8"; // 反灰
                }
            } else {
                // 狀態 B：還沒交卷 -> 正常載入題目，按鈕恢復正常
                loadDailyChecklist(); 
                
                if (submitBtn) {
                    submitBtn.innerText = "提交我的拼圖";
                    submitBtn.disabled = false;
                    submitBtn.style.background = "var(--primary)"; // 恢復主色
                }
            }
            
        }else if (config.status === 'active' && players[myUid] && players[myUid].identity) {
            // 狀態 2：遊戲進行中，顯示任務牆
            showScreen('game-screen');
            document.getElementById('main-header').style.display = 'block';
            document.getElementById('angel-target-display').innerText = players[myUid].identity.angel_to_name;
            document.getElementById('demon-target-display').innerText = players[myUid].identity.demon_to_name;
            updateSelects(players);
            
            // 🌟 1. 更新自己的總積分顯示
            const ptsDisplay = document.getElementById('my-current-points');
            if(ptsDisplay) ptsDisplay.innerText = players[myUid].total_points || 0;

            // 🌟 2. 計算排行榜 Top 3
            const topBoard = document.getElementById('top-leaderboard');
            if (topBoard) {
                // 將玩家轉為陣列並依分數由高到低排序
                const sortedPlayers = Object.values(players)
                    .map(p => ({ name: p.name, points: p.total_points || 0 }))
                    .sort((a, b) => b.points - a.points);
                
                topBoard.innerHTML = '';
                const top3 = sortedPlayers.slice(0, 3);
                const medals = ['🥇', '🥈', '🥉'];
                top3.forEach((p, index) => {
                    topBoard.innerHTML += `<li>${medals[index]} <b>${p.name}</b>：${p.points} 分</li>`;
                });
            }
            
            // 🔒 每日猜猜看鎖定邏輯
            const guessBtn = document.querySelector('#tab-guess button'); // 抓取提交按鈕
            if (players[myUid].has_guessed_today) {
                // 如果今天已經猜過：禁用下拉選單與按鈕，並變更樣式
                document.getElementById('guess-a').disabled = true;
                document.getElementById('guess-d').disabled = true;
                if (guessBtn) {
                    guessBtn.innerText = "今日已經提交";
                    guessBtn.disabled = true;
                    guessBtn.style.background = "#94a3b8"; // 變成反灰狀態
                }
            } else {
                // 如果今天還沒猜：恢復正常狀態
                document.getElementById('guess-a').disabled = false;
                document.getElementById('guess-d').disabled = false;
                if (guessBtn) {
                    guessBtn.innerText = "提交指認";
                    guessBtn.disabled = false;
                    guessBtn.style.background = "var(--primary)"; // 恢復主色按鈕
                }
            }
        } else {
            // 狀態 3：遊戲尚未開始，停留在等待室
            showScreen('waiting-screen');
            document.getElementById('main-header').style.display = 'none';
        }

        // 上帝視角數據更新 (表格結構對了，這裡就會正確顯示了)
        // updateAdminMonitor(players);
    });

    // 匿名信箱即時監聽維持不變
    db.ref('messages').on('value', (snap) => {
        const list = document.getElementById('mailbox-list');
        list.innerHTML = '<h3>📥 我的收件匣</h3>';
        if (snap.exists()) {
            Object.values(snap.val()).reverse().forEach(m => {
                if (m.to === myUid) {
                    const div = document.createElement('div');
                    div.style = "background:#f1f5f9; padding:10px; border-radius:8px; margin-bottom:10px; border-left:4px solid var(--primary);";
                    div.innerHTML = `${m.content}<br><small style="color:#94a3b8">來自：匿名 • ${m.time}</small>`;
                    list.appendChild(div);
                }
            });
        }
    });
}

// --- 5. 遊戲動作 ---
// function submitTask(type) {
//     const taskName = document.getElementById(`select-task-${type}`).value; // 取得所選任務名稱
//     const proof = document.getElementById(`proof-${type}`).value.trim();   // 取得證明文字或連結
    
//     if (!proof) return alert("請輸入證明內容或圖片連結以供管理員審核");
    
//     const scoreAdd = (type === 'angel') ? 15 : 10;
    
//     // 構建任務資料物件
//     const taskData = {
//         type: type,
//         task_title: taskName, // 紀錄玩家選了哪一個任務
//         proof: proof,
//         status: "submitted",   // 狀態標記為已提交，供管理員抽查 [cite: 14, 15]
//         time: new Date().toLocaleString(),
//         points: scoreAdd
//     };

//     // 1. 寫入任務紀錄分支
//     db.ref(`players/${myUid}/tasks`).push(taskData);

//     // 2. 模式 C：積分即時入帳 [cite: 13, 16]
//     db.ref(`players/${myUid}/total_points`).transaction(s => (s || 0) + scoreAdd);
    
//     alert(`【${taskName}】已提交！\n積分 +${scoreAdd} 已入帳，管理員將進行後續審核。`);
//     document.getElementById(`proof-${type}`).value = ''; // 清空輸入框
// }

// 切換顯示自訂輸入框
function checkCustom(type) {
    const sel = document.getElementById(`select-task-${type}`).value;
    document.getElementById(`custom-task-${type}`).style.display = (sel === 'custom') ? 'block' : 'none';
}

// 提交盲測任務 (無須證明，提交後選項消失)
function submitBlindTask(type) {
    const selectElem = document.getElementById(`select-task-${type}`);
    let taskName = selectElem.value;
    
    if (!taskName) return alert("請先選擇一個任務！");
    
    if (taskName === 'custom') {
        taskName = document.getElementById(`custom-task-${type}`).value.trim();
        if (!taskName) return alert("請輸入你自訂的任務內容！");
    }

    // 取得目標對象是誰
    let targetUid = "";
    db.ref(`players/${myUid}/identity`).once('value', snap => {
        const iden = snap.val();
        targetUid = (type === 'angel') ? iden.angel_to : iden.demon_to;

        // 寫入公用的 daily_events 節點，供晚上盲測使用
        db.ref('daily_events').push({
            actor: myUid,
            target: targetUid,
            task: taskName,
            type: type
        });

        alert(`任務已提交！請等待今晚的盲測結算。`);
        
        // 【機制】：提交後讓該選項禁用（閱後即焚）
        if (selectElem.value !== 'custom') {
            selectElem.options[selectElem.selectedIndex].disabled = true;
        }
        selectElem.value = "";
        checkCustom(type); // 隱藏輸入框
    });
}

function sendMail() {
    const to = document.getElementById('mail-to').value;
    const content = document.getElementById('mail-msg').value.trim();
    if (!to || !content) return alert("請選擇收件人並填寫內容");
    
    // 1. 將信件推送到資料庫
    db.ref('messages').push({ 
        to: to, 
        content: content, 
        time: new Date().toLocaleTimeString() 
    });
    
    // 2. 🌟 關鍵點：這裡「只」紀錄今天發了幾封信，絕對不能出現 total_points！
    db.ref(`players/${myUid}/daily_mails_sent`).transaction(count => {
        return (count || 0) + 1;
    });
    
    // 3. 清空輸入框並提示玩家
    document.getElementById('mail-msg').value = '';
    alert("匿名信已送出！積分將於今晚結算時統一發放。");
}

function submitGuess() {
    const a = document.getElementById('guess-a').value;
    const d = document.getElementById('guess-d').value;
    if (!a || !d) return alert("請選擇指認對象");
    
    // 將猜測結果與「今日已提交」的標記一起寫入資料庫
    db.ref(`players/${myUid}`).update({
        final_guess: { a, d },
        has_guessed_today: true
    }).then(() => {
        alert("指認完成！請等待明天的重新開放。");
    });
}

// --- 6. 管理員功能 ---


function adjustScore(uid, amount) {
    if(confirm("確定要針對此證明進行扣分處罰嗎？")) {
        db.ref(`players/${uid}/total_points`).transaction(s => (s || 0) + amount);
        alert("已扣分處理。");
    }
}

function assignRoles() {
    db.ref('players').once('value', (snap) => {
        const players = snap.val();
        const uids = Object.keys(players);
        if (uids.length < 3) return alert("人數不足 (需至少 3 人)");
        let shuff = [...uids].sort(() => Math.random() - 0.5);
        let up = {};
        for (let i = 0; i < shuff.length; i++) {
            const cur = shuff[i];
            const a = shuff[(i + 1) % shuff.length];
            const d = shuff[(i + 2) % shuff.length];
            up[`players/${cur}/identity`] = { 
                angel_to: a, angel_to_name: players[a].name, 
                demon_to: d, demon_to_name: players[d].name 
            };
        }
        up['camp_config/status'] = 'active';
        db.ref().update(up);
    });
}

function resetGame() {
    if (confirm("⚠️ 確定要註銷所有帳號並重置嗎？")) {
        db.ref('/').set({ camp_config: { status: 'waiting' } });
    }
}

function revealAll() {
    db.ref('players').once('value', (snap) => {
        const p = snap.val();
        let res = "【全體小天使與惡魔揭曉報告】\n\n";
        for (let id in p) {
            res += `👤 ${p[id].name} 的守護者是 ${p[id].identity.angel_to_name} | 惡魔是 ${p[id].identity.demon_to_name}\n`;
        }
        console.log(res); alert("報告已生成於 Console，並在此顯示：\n\n" + res);
    });
}
function endGame() {
    if (confirm("⚠️ 確定要結束營隊遊戲，並向全體玩家揭曉身分嗎？")) {
        // 將遊戲狀態改為 ended，觸發全體玩家畫面跳轉
        db.ref('camp_config/status').set('ended');
    }
}

// --- 工具函數 ---
function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.nav-tabs li').forEach(l => l.classList.remove('active'));
    document.getElementById(id).style.display = 'block';
    document.getElementById('btn-' + id).classList.add('active');
}

function updateSelects(players) {
    const ids = ['mail-to', 'guess-a', 'guess-d'];
    ids.forEach(id => {
        const s = document.getElementById(id);
        const v = s.value;
        s.innerHTML = '<option value="">-- 選擇成員 --</option>';
        for (let u in players) if (u !== myUid) {
            const o = document.createElement('option'); o.value = u; o.innerText = players[u].name; s.appendChild(o);
        }
        s.value = v;
    });
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function logout() { sessionStorage.clear(); location.reload(); }

function showAdmin() {
    const pass = prompt("請輸入管理員密碼");
    if (pass === "admin123") {
        // 1. 先強制讓控制台顯示
        const adminPanel = document.getElementById('admin-panel');
        if (adminPanel) {
            adminPanel.style.display = 'block';
            // 自動滾動到最下方看到控制台
            adminPanel.scrollIntoView({ behavior: 'smooth' });
        } else {
            return alert("找不到 id 為 admin-panel 的標籤！");
        }

        // 2. 嘗試啟動監控 (加上防護，沒定義也不會當機)
        if (typeof startAdminMonitor === "function") {
            startAdminMonitor();
        } else {
            console.warn("提醒：startAdminMonitor 函數尚未定義，無法即時更新表格。");
        }
    } else {
        alert("密碼錯誤！");
    }
}

// --- 專屬管理員的即時監聽器 (獨立運作，不受畫面切換干擾) ---
function startAdminMonitor() {
    // 就像 revealAll 一樣，我們直接且單獨監聽 'players' 節點
    db.ref('players').on('value', (snap) => {
        const tbody = document.getElementById('admin-monitor');
        if (!tbody) return; 
        
        tbody.innerHTML = ''; // 清空舊畫面
        const players = snap.val();
        
        if (!players) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">目前無玩家資料</td></tr>';
            return;
        }

        for (let uid in players) {
            const p = players[uid];
            const tr = document.createElement('tr');
            
            // 抓取基本資料 (玩家與積分)
            const playerName = p.name || '未知玩家';
            const playerPoints = p.total_points || 0;
            const playerPass = p.password || '無';

            // 抓取最後一筆任務證明
            // const lastTask = p.tasks ? Object.values(p.tasks).pop() : null;
            // let proofContent = '<span style="color:#94a3b8">尚未提交</span>';
            
            // if (lastTask) {
            //     const proofStr = lastTask.proof ? String(lastTask.proof) : "無內容";
            //     const titleStr = lastTask.task_title ? String(lastTask.task_title) : "任務";
            //     const isImg = proofStr.match(/\.(jpeg|jpg|gif|png)$/) != null || proofStr.startsWith('http');
                
            //     proofContent = isImg 
            //         ? `<div class="proof-box">
            //              <b>${titleStr}</b><br>
            //              <img src="${proofStr}" style="width:120px; margin-top:5px; border-radius:4px;"><br>
            //              <small style="word-break:break-all; color:blue;">${proofStr}</small>
            //            </div>`
            //         : `<div class="proof-box"><b>${titleStr}</b><br>${proofStr}</div>`;
            // }

            // 畫出表格
            tr.innerHTML = `
                <td>${playerName}</td>
                <td style="font-weight:bold; color:var(--primary)">${playerPoints}</td>
                <td>${playerPass}</td>
                <td>
                    <button onclick="adjustScore('${uid}', -10)" style="background:#ef4444; color:white; padding:4px; font-size:10px; width:auto;">扣10分</button>
                </td>
            `;
            tbody.appendChild(tr);
        }
    });
}
// --- 盲測拼圖核心邏輯 ---

// ==========================================
// --- 管理員：步驟 1. 載入任務並進行審核 ---
// ==========================================
function loadTasksForAdmin() {
    db.ref('daily_events').once('value', snap => {
        const events = snap.val();
        const reviewBox = document.getElementById('admin-task-review');
        const listDiv = document.getElementById('review-list');
        
        reviewBox.style.display = 'block';
        listDiv.innerHTML = '';

        if (!events) {
            listDiv.innerHTML = '<span style="color:#ef4444;">今日尚無任何任務提交。</span>';
            return;
        }

        // 抓出所有任務並去重複
        const uniqueTasks = [...new Set(Object.values(events).map(e => e.task))];
        
        uniqueTasks.forEach(taskStr => {
            // 預設全勾選，管理員可以把不妥的選項取消勾選
            listDiv.innerHTML += `
                <label style="display:block; margin-bottom:5px; cursor:pointer;">
                    <input type="checkbox" value="${taskStr}" class="admin-task-cb" checked> 
                    ${taskStr}
                </label>`;
        });
    });
}

// 管理員手動加入煙霧彈 (假任務)
function addFakeTask() {
    const val = document.getElementById('fake-task-input').value.trim();
    if (val) {
        document.getElementById('review-list').insertAdjacentHTML('afterbegin', `
            <label style="display:block; margin-bottom:5px; cursor:pointer; color:#be123c;">
                <input type="checkbox" value="${val}" class="admin-task-cb" checked> 
                ${val} <small>(手動加入)</small>
            </label>`);
        document.getElementById('fake-task-input').value = ''; // 清空輸入框
    }
}

// ==========================================
// --- 管理員：步驟 2. 發布任務並觸發盲測 ---
// ==========================================
function publishAndStartSettlement() {
    const checkboxes = document.querySelectorAll('.admin-task-cb:checked');
    const approvedTasks = Array.from(checkboxes).map(cb => cb.value);

    if (approvedTasks.length === 0 && !confirm("您沒有勾選任何任務，確定要發布空白表單嗎？")) {
        return;
    }

    if (confirm("即將發布這些任務給全體玩家，並強制跳轉至盲測畫面！確定嗎？")) {
        let updates = {};
        // 將核准的任務存入一個新的節點 approved_tasks
        updates['camp_config/approved_tasks'] = approvedTasks;
        // 切換遊戲狀態，觸發所有玩家畫面跳轉
        updates['camp_config/status'] = 'daily_settlement';

        db.ref().update(updates).then(() => {
            alert("✅ 任務已發布！全體玩家已進入盲測作答畫面。");
            document.getElementById('admin-task-review').style.display = 'none'; // 收起審核區
        });
    }
}

// ==========================================
// --- 玩家端：載入「審核過」的拼圖清單 ---
// ==========================================
// (這個函數會被 startSync 在進入 daily_settlement 狀態時自動呼叫)
function loadDailyChecklist() {
    // 玩家不再讀取 daily_events，而是讀取管理員篩選過的 approved_tasks
    db.ref('camp_config/approved_tasks').once('value', snap => {
        const approvedTasks = snap.val() || [];
        const container = document.getElementById('checklist-container');
        container.innerHTML = '';
        
        if (approvedTasks.length === 0) {
            container.innerHTML = '今天大家都很乖，沒有任何事件發生。';
            return;
        }

        // 隨機打亂任務順序，不讓玩家看出端倪
        approvedTasks.sort(() => Math.random() - 0.5);

        approvedTasks.forEach(taskStr => {
            const label = document.createElement('label');
            label.style = "display:block; margin-bottom:8px; cursor:pointer;";
            label.innerHTML = `<input type="checkbox" value="${taskStr}" style="width:auto; margin-right:10px;"> ${taskStr}`;
            container.appendChild(label);
        });
    });
}

// // 載入當日所有出現過的任務清單
// function loadDailyChecklist() {
//     db.ref('daily_events').once('value', snap => {
//         const events = snap.val();
//         const container = document.getElementById('checklist-container');
//         container.innerHTML = '';
        
//         if (!events) {
//             container.innerHTML = '今天大家都很乖，沒有任何事件發生。';
//             return;
//         }

//         // 抓取所有任務名稱，並使用 Set 進行「字串精準去重複」
//         const uniqueTasks = [...new Set(Object.values(events).map(e => e.task))];
        
//         // 隨機打亂任務順序，避免被猜出先後關聯
//         uniqueTasks.sort(() => Math.random() - 0.5);

//         uniqueTasks.forEach(taskStr => {
//             const label = document.createElement('label');
//             label.style = "display:block; margin-bottom:8px; cursor:pointer;";
//             label.innerHTML = `<input type="checkbox" value="${taskStr}" style="width:auto; margin-right:10px;"> ${taskStr}`;
//             container.appendChild(label);
//         });
//     });
// }

// 玩家送出自己的拼圖勾選
// 玩家送出自己的拼圖勾選
function submitChecklist() {
    const checkboxes = document.querySelectorAll('#checklist-container input:checked');
    const checkedTasks = Array.from(checkboxes).map(cb => cb.value);
    
    // 🌟 修改：同時更新勾選清單與「已提交」標記
    db.ref(`players/${myUid}`).update({
        daily_checked: checkedTasks,
        has_submitted_checklist: true 
    }).then(() => {
        alert("拼圖已送出！請等待管理員公佈結果。");
    });
}

// 管理員動作 B：核對拼圖與猜測，並計算所有進階分數
function calculateAndApplyScores() {
    if(!confirm("確定大家都在盲測畫面上交卷了嗎？即將計算拼圖與心理戰分數！")) return;

    db.ref('/').once('value', snap => {
        const data = snap.val();
        const events = data.daily_events || {};
        const players = data.players || {};
        
        let updates = {};
        
        // --- 準備工作：建立反向字典與初始化更新快取 ---
        let trueAngels = {}; 
        let trueDemons = {}; 

        for (let uid in players) {
            if (players[uid].identity) {
                trueAngels[players[uid].identity.angel_to] = uid;
                trueDemons[players[uid].identity.demon_to] = uid;
            }
            // 預先把大家目前的分數載入 updates 暫存區
            updates[`players/${uid}/total_points`] = players[uid].total_points || 0;
        }

        // --- 1. 結算盲測拼圖 (日常任務) ---
        for (let eventId in events) {
            const ev = events[eventId];
            const actorId = ev.actor;
            const targetId = ev.target;
            const taskName = ev.task;
            
            const targetChecked = (players[targetId] && players[targetId].daily_checked) ? players[targetId].daily_checked : [];
            const isMatch = targetChecked.includes(taskName);
            
            if (isMatch) {
                updates[`players/${actorId}/total_points`] += 25; // 雙向奔赴
                updates[`players/${targetId}/total_points`] += 25;
            } else {
                updates[`players/${actorId}/total_points`] += 10; // 默默付出
            }
        }
        
        // --- 2. 結算終極對決 (神探獎 與 煙霧彈大師) ---
        // ---------------------------------------------------------
        // 2. 結算「今日猜猜看」分數
        // ---------------------------------------------------------
        for (let uid in players) {
            // 抓取剛剛算完盲測後的最新分數
            let currentPts = updates[`players/${uid}/total_points`] !== undefined ? updates[`players/${uid}/total_points`] : (players[uid].total_points || 0);

            // 如果這個人今天有提交猜測... (保留原本猜猜看的邏輯)
            if (players[uid].final_guess && players[uid].has_guessed_today) {
                let guessA = players[uid].final_guess.a;
                let guessD = players[uid].final_guess.d;
                if (guessA === trueAngels[uid]) currentPts += 20;
                if (guessD === trueDemons[uid]) currentPts += 20;
            }

            // 🌟 新增：結算匿名信箱分數 (每封2分，每日上限10分)
            let mailsSent = players[uid].daily_mails_sent || 0;
            if (mailsSent > 0) {
                let mailBonus = Math.min(mailsSent * 2, 10); // 取發信分數或上限 10 分較小者
                currentPts += mailBonus;
            }

            // 把加總後的分數寫回 updates
            updates[`players/${uid}/total_points`] = currentPts;

            // ---------------------------------------------------------
            // 3. 清空今日紀錄，準備迎接明天
            // ---------------------------------------------------------
            updates[`players/${uid}/daily_checked`] = null;
            updates[`players/${uid}/has_guessed_today`] = null;
            updates[`players/${uid}/daily_mails_sent`] = null; // 🌟 清空今日發信數量
        }

        // --- 3. 結算完美潛伏 (沒被主人猜中) ---
        for (let uid in players) {
            if (players[uid].identity) {
                let myAngelTarget = players[uid].identity.angel_to;
                let myDemonTarget = players[uid].identity.demon_to;

                // 抓取「我的目標們」今天的猜測結果
let angelTargetGuess = (players[myAngelTarget] && players[myAngelTarget].final_guess && players[myAngelTarget].has_guessed_today) ? players[myAngelTarget].final_guess.a : null;

let demonTargetGuess = (players[myDemonTarget] && players[myDemonTarget].final_guess && players[myDemonTarget].has_guessed_today) ? players[myDemonTarget].final_guess.d : null;

                // 🥷 完美潛伏：我守護的人，沒有猜中我是他的天使 (給一半 15 分)
                if (angelTargetGuess !== uid) {
                    updates[`players/${uid}/total_points`] += 15;
                }
                // 🥷 完美潛伏：我捉弄的人，沒有猜中我是他的惡魔 (給另一半 15 分，全瞞過就是 +30)
                if (demonTargetGuess !== uid) {
                    updates[`players/${uid}/total_points`] += 15;
                }
            }

            // --- 4. 清空今日紀錄，迎接明天 ---
            updates[`players/${uid}/daily_checked`] = null;
            updates[`players/${uid}/has_guessed_today`] = null;
            updates[`players/${uid}/daily_mail_points`] = null; // 🔓 重新開放明天的 10 分信箱額度
            updates[`players/${uid}/has_submitted_checklist`] = null;
        }
        
        // 清空事件，並把遊戲切回 active 讓大家看到新分數
        updates['daily_events'] = null;
        updates['camp_config/status'] = 'active'; 
        
        db.ref().update(updates).then(() => {
            alert("✅ 結算完成！分數已發放，匿名信箱額度與猜測機制已重置，玩家已返回遊戲畫面。");
        });
    });
}