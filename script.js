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
    const remember = document.getElementById('remember-me').checked;

    if (!name || !pass) return alert("請填寫完整帳密");

    // 🌟 正確寫法：透過 orderByChild 精準搜尋玩家名稱
    db.ref('players').orderByChild('name').equalTo(name).once('value', (snap) => {
        if (snap.exists()) {
            // 👤 狀況 A：帳號存在，執行【登入】邏輯
            let uid = Object.keys(snap.val())[0];
            let p = snap.val()[uid];
            
            if (p.password && p.password !== pass) {
                return alert("密碼錯誤！如果忘記密碼請找管理員。");
            }
            
            // 密碼正確，處理記住我並登入
            handleRememberMe(name, pass, remember);
            sessionStorage.setItem('game_uid', uid);
            sessionStorage.setItem('game_username', name);
            location.reload();
        } else {
            // 👤 狀況 B：帳號不存在，準備【註冊】
            // 🌟 防護鎖：先檢查大廳的遊戲狀態 (正確路徑：camp_config/status)
            db.ref('camp_config/status').once('value', (statusSnap) => {
                const gameStatus = statusSnap.val() || 'waiting';
                
                // 如果不是 waiting，代表遊戲已經開始，阻擋註冊！
                if (gameStatus !== 'waiting') {
                    alert(`⛔ 遊戲已經開始，停止開放新帳號註冊！\n\n💡 如果你是已經註冊過的玩家，請檢查你的「玩家名稱」是否有錯字或多打了空白喔！`);
                    return;
                }

                // 如果還在 waiting，放行註冊
                const newRef = db.ref('players').push();
                newRef.set({
                    name: name,
                    password: pass, 
                    total_points: 0
                }).then(() => {
                    handleRememberMe(name, pass, remember);
                    sessionStorage.setItem('game_uid', newRef.key);
                    sessionStorage.setItem('game_username', name);
                    alert("註冊成功！歡迎加入遊戲。");
                    location.reload();
                });
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
function startSync() {
    db.ref('/').on('value', (snapshot) => {
        const data = snapshot.val();
        
        // 1. 如果資料庫被徹底清空，強制登出
        if (!data) {
            logout();
            return;
        }

        // 2. 確保 players 存在
        const players = data.players || {};
        const config = data.camp_config || { status: 'waiting' };
        
        // 3. 核心防呆：如果玩家被重置，強制登出
        if (myUid && !players[myUid]) {
            logout();
            return;
        }

        // 基本介面資訊更新
        if (document.getElementById('user-bar')) document.getElementById('user-bar').style.display = 'flex';
        if (document.getElementById('bar-username')) document.getElementById('bar-username').innerText = myName;
        if (document.getElementById('wait-name')) document.getElementById('wait-name').innerText = myName;
        if (document.getElementById('player-count')) document.getElementById('player-count').innerText = Object.keys(players).length;

        // ---------------------------------------------------------
        // 核心狀態切換邏輯
        // ---------------------------------------------------------
        
        if (config.status === 'ended') {
            // 🏆 狀態 1：遊戲結束，顯示榮譽榜
            showScreen('end-screen');
            document.getElementById('user-bar').style.display = 'none';
            document.getElementById('main-header').style.display = 'none';

            // 🌟 填入最終分數
            if(players[myUid]) {
                document.getElementById('final-score').innerText = players[myUid].total_points || 0;
            }

            // 🌟 關鍵：將大獎名單填入翻牌卡片 (解決載入中問題)
            if (config.final_awards) {
                document.getElementById('award-mvp').innerText = config.final_awards.mvp.name;
                document.getElementById('award-angel').innerText = config.final_awards.angel.name;
                document.getElementById('award-demon').innerText = config.final_awards.demon.name;
                document.getElementById('award-stealth-angel').innerText = config.final_awards.stealthAngel.name;
                document.getElementById('award-stealth-demon').innerText = config.final_awards.stealthDemon.name;
            }

            // 顯示誰是我的天使與惡魔
            let myAngelName = "未指派";
            let myDemonName = "未指派";
            for (let id in players) {
                if (players[id].identity) {
                    if (players[id].identity.angel_to === myUid) myAngelName = players[id].name;
                    if (players[id].identity.demon_to === myUid) myDemonName = players[id].name;
                }
            }
            document.getElementById('my-angel-reveal').innerText = myAngelName;
            document.getElementById('my-demon-reveal').innerText = myDemonName;

        } else if (config.status === 'daily_settlement') {
            // 🧩 狀態 2：晚間盲測拼圖畫面
            showScreen('daily-settle-screen');
            document.getElementById('main-header').style.display = 'none';
            
            const submitBtn = document.querySelector('#daily-settle-screen button');
            if (players[myUid] && players[myUid].has_submitted_checklist) {
                document.getElementById('checklist-container').innerHTML = '<div style="text-align:center; padding: 20px; color:#64748b; font-weight:bold;">你已經提交過今日的拼圖囉！<br>請靜候管理員結算。</div>';
                if (submitBtn) {
                    submitBtn.innerText = "今日已提交";
                    submitBtn.disabled = true;
                    submitBtn.style.background = "#94a3b8";
                }
            } else {
                loadDailyChecklist(); 
                if (submitBtn) {
                    submitBtn.innerText = "提交我的拼圖";
                    submitBtn.disabled = false;
                    submitBtn.style.background = "var(--primary)";
                }
            }
            
        } else if (config.status === 'active' && players[myUid] && players[myUid].identity) {
            // 🎮 狀態 3：遊戲進行中 (顯示任務牆、信箱、猜猜看)
            showScreen('game-screen');
            document.getElementById('main-header').style.display = 'block';
            document.getElementById('angel-target-display').innerText = players[myUid].identity.angel_to_name || "無";
            document.getElementById('demon-target-display').innerText = players[myUid].identity.demon_to_name || "無";
            updateSelects(players);
            
            // 更新個人積分與排行榜
            const ptsDisplay = document.getElementById('my-current-points');
            if(ptsDisplay) ptsDisplay.innerText = players[myUid].total_points || 0;

            const topBoard = document.getElementById('top-leaderboard');
            if (topBoard) {
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
            
            // 猜猜看按鈕鎖定邏輯
            const guessBtn = document.querySelector('#tab-guess button');
            if (players[myUid].has_guessed_today) {
                document.getElementById('guess-a').disabled = true;
                document.getElementById('guess-d').disabled = true;
                if (guessBtn) {
                    guessBtn.innerText = "今日已經提交";
                    guessBtn.disabled = true;
                    guessBtn.style.background = "#94a3b8";
                }
            } else {
                document.getElementById('guess-a').disabled = false;
                document.getElementById('guess-d').disabled = false;
                if (guessBtn) {
                    guessBtn.innerText = "提交指認";
                    guessBtn.disabled = false;
                    guessBtn.style.background = "var(--primary)";
                }
            }
        } else {
            // ⏳ 狀態 4：等待室
            showScreen('waiting-screen');
            if (document.getElementById('main-header')) document.getElementById('main-header').style.display = 'none';
        }
    });

    // 匿名信箱即時監聽 (保持不變)
    db.ref('messages').on('value', (snap) => {
        const list = document.getElementById('mailbox-list');
        if(!list) return;
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
    if (!confirm("⚠️ 確定要結束營隊遊戲，並向全體揭曉身分與大獎嗎？")) return;

    db.ref('players').once('value', snap => {
        const players = snap.val();
        let awards = {
            mvp: { name: "無", score: -1 },
            angel: { name: "無", score: -1 },
            demon: { name: "無", score: -1 },
            stealthAngel: { name: "無", score: -999 },
            stealthDemon: { name: "從缺", score: -999 }
        };

        for (let uid in players) {
            let p = players[uid];
            
            // 1. MVP (總分最高)
            if ((p.total_points || 0) > awards.mvp.score) {
                awards.mvp = { name: p.name, score: p.total_points };
            }

            // 2. 最佳守護天使 (認證任務最多)
            let vAngel = p.verified_angel_tasks || 0;
            if (vAngel > awards.angel.score) {
                awards.angel = { name: p.name, score: vAngel };
            }

            // 3. 最毒小惡魔
            let vDemon = p.verified_demon_tasks || 0;
            if (vDemon > awards.demon.score) {
                awards.demon = { name: p.name, score: vDemon };
            }

            // 4. 最佳隱形天使 (演算法計算)
            // 公式：Stealth Score = (V * 20) - (G * 30)
            let gAngel = p.times_guessed_as_angel || 0;
            let stealthScore = (vAngel * 20) - (gAngel * 30);
            // 條件：至少有做任務才具備隱形天使資格
            if (vAngel > 0 && stealthScore > awards.stealthAngel.score) {
                awards.stealthAngel = { name: p.name, score: stealthScore };
            }

            let gDemon = p.times_guessed_as_demon || 0;
            let stealthDemonScore = (vDemon * 20) - (gDemon * 30);
            // 條件同上：至少有陷害成功過一次 (V > 0)
            if (vDemon > 0 && stealthDemonScore > awards.stealthDemon.score) {
                awards.stealthDemon = { name: p.name, score: stealthDemonScore };
            }
        }

        // 把算好的獎項寫入 config 並改變狀態
        db.ref('camp_config').update({
            status: 'ended',
            final_awards: awards
        });
    });
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

        // 3. 信箱監聽
        // if (typeof listenToAdminMessages === "function") {
            listenToAdminMessages();
        // }
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
                <td><button onclick="deletePlayer('${uid}')" style="background:#ef4444; color:white; border:none; padding:3px 8px; border-radius:4px; cursor:pointer; font-size:12px;">刪除</button></td>
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
                
                // 👇 這裡新增：紀錄成功被目標認證的任務次數 (用於結算最佳天使與惡魔)
                // 注意：ev.type 會是 'angel' 或 'demon'，所以會自動存成 verified_angel_tasks 或 verified_demon_tasks
                let currentTaskCount = players[actorId][`verified_${ev.type}_tasks`] || 0;
                updates[`players/${actorId}/verified_${ev.type}_tasks`] = currentTaskCount + 1;

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
                } else {
                    // 👇 這裡新增：糟糕！被守護的對象猜中了，增加被猜中次數 (用於結算最佳隱形天使)
                    let currentGuessedAsAngel = players[uid].times_guessed_as_angel || 0;
                    updates[`players/${uid}/times_guessed_as_angel`] = currentGuessedAsAngel + 1;
                }

                // 🥷 完美潛伏：我捉弄的人，沒有猜中我是他的惡魔 (給另一半 15 分，全瞞過就是 +30)
                if (demonTargetGuess !== uid) {
                    updates[`players/${uid}/total_points`] += 15;
                } else {
                    // 👇 這裡新增：糟糕！被陷害的對象猜中了，增加被猜中次數 (用於結算最佳隱形惡魔)
                    let currentGuessedAsDemon = players[uid].times_guessed_as_demon || 0;
                    updates[`players/${uid}/times_guessed_as_demon`] = currentGuessedAsDemon + 1;
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

// 🌟 管理員專用：刪除單一玩家
function deletePlayer(targetUid) {
    // 雙重確認，避免手滑點錯
    const confirmDelete = confirm(`⚠️ 警告：確定要註銷/刪除玩家「${targetUid}」嗎？\n刪除後該玩家將無法登入，且所有積分與紀錄會永久消失！`);
    
    if (confirmDelete) {
        db.ref(`players/${targetUid}`).remove().then(() => {
            alert(`✅ 玩家「${targetUid}」已被成功刪除！`);
            // Firebase 會自動觸發資料庫變動，表格會自動重繪，不用手動重新整理
        }).catch((error) => {
            console.error("刪除失敗:", error);
            alert("刪除失敗，請檢查網路連線或權限設定。");
        });
    }
}

// 💬 發送訊息給管理員
function sendToAdmin() {
    const content = document.getElementById('admin-msg-content').value.trim();
    // 判斷玩家選了實名還是匿名
    const isAnonymous = document.querySelector('input[name="admin-msg-type"]:checked').value === 'anonymous';

    if (!content) {
        alert("⚠️ 請輸入想對上帝說的話！");
        return;
    }

    // 決定顯示名稱：如果是匿名就顯示幽靈，否則顯示真實玩家名稱
    const senderName = isAnonymous ? "👻 匿名玩家" : myName;

    // 將資料推送到專屬的 admin_messages 節點
    const msgRef = db.ref('admin_messages').push();
    msgRef.set({
        sender: senderName,
        senderUid: isAnonymous ? "anonymous" : myUid,
        content: content,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        alert("✅ 訊息已成功發送給上帝！");
        document.getElementById('admin-msg-content').value = ""; // 清空輸入框
    }).catch((error) => {
        console.error("發送失敗:", error);
        alert("❌ 發送失敗，請稍後再試。");
    });
}

// 📨 管理員接收訊息即時監聽
function listenToAdminMessages() {
    console.log("系統：上帝收件匣監聽已啟動...");
    
    db.ref('admin_messages').orderByChild('timestamp').on('value', (snap) => {
        const msgListContainer = document.getElementById('admin-msg-list');
        if (!msgListContainer) return;

        if (!snap.exists()) {
            msgListContainer.innerHTML = '<p style="color: #94a3b8; font-size: 12px; text-align: center;">目前沒有新訊息</p>';
            return;
        }

        let html = '';
        snap.forEach((child) => {
            const msg = child.val();
            const msgId = child.key; // 🔑 取得這則訊息在資料庫裡的專屬 ID
            
            const timeString = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            const isAnon = msg.senderUid === "anonymous";
            const cardStyle = isAnon 
                ? "background: #ffffff; border-left: 4px solid #94a3b8;" 
                : "background: #f3e8ff; border-left: 4px solid #8b5cf6;";
            const nameColor = isAnon ? "#64748b" : "#8b5cf6";

            // 加入了 position: relative 與小垃圾桶按鈕
            html = `
            <div style="${cardStyle} padding: 10px; border-radius: 4px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); position: relative;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                    <strong style="color: ${nameColor};">${msg.sender}</strong>
                    <span style="color: #94a3b8; margin-right: 20px;">${timeString}</span>
                </div>
                <div style="color: #334155; font-size: 14px; white-space: pre-wrap; line-height: 1.4; padding-right: 20px;">${msg.content}</div>
                
                <button onclick="deleteSingleAdminMessage('${msgId}')" style="position: absolute; top: 8px; right: 8px; background: none; border: none; cursor: pointer; font-size: 14px; opacity: 0.5;" title="刪除此訊息" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.5'">🗑️</button>
            </div>
            ` + html;
        });
        
        msgListContainer.innerHTML = html;
    });
}

// 🗑️ 清空所有上帝訊息
function clearAdminMessages() {
    if (confirm("🚨 確定要清空「上帝收件匣」的所有訊息嗎？此動作無法復原。")) {
        db.ref('admin_messages').remove()
            .then(() => alert("✅ 已清空所有訊息"))
            .catch(err => alert("❌ 清空失敗: " + err));
    }
}

// 🗑️ 刪除單一上帝訊息
function deleteSingleAdminMessage(msgId) {
    if (confirm("確定要刪除這條訊息嗎？")) {
        // 針對特定 ID 的訊息進行移除
        db.ref('admin_messages/' + msgId).remove()
            .catch(err => alert("❌ 刪除失敗: " + err));
    }
}

let isLeaderboardListening = false; // 🌟 避免重複啟動監聽的開關

// 🏆 啟動並監聽匿名排行榜
function listenToLeaderboard() {
    if (isLeaderboardListening) return; // 如果已經啟動過，就不要重複啟動
    isLeaderboardListening = true;

    db.ref('players').on('value', snap => {
        const listContainer = document.getElementById('leaderboard-list');
        if (!listContainer) return;

        // 🌟 防呆：如果資料庫完全沒資料，替換掉「載入中」文字
        if (!snap.exists()) {
            listContainer.innerHTML = '<p style="text-align: center; color: #94a3b8; font-size: 13px;">目前還沒有任何玩家資料喔！</p>';
            return;
        }

        const players = snap.val();
        let playerArr = [];

        // 1. 把所有玩家資料轉成陣列
        for (let uid in players) {
            // 排除掉管理員帳號
            if (players[uid].name !== 'admin') { 
                playerArr.push({
                    points: players[uid].total_points || 0
                });
            }
        }

        // 2. 依照分數由高到低排序 (b - a)
        playerArr.sort((a, b) => b.points - a.points);

        // 3. 只取前 5 名
        const top5 = playerArr.slice(0, 5);

        // 4. 定義匿名代號與獎牌
        const anonymousNames = ["🤫 神秘卷王", "👻 潛伏大師", "🥷 隱形殺手", "🕵️ 未知高手", "🎭 幕後黑手"];
        const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

        // 5. 生成 HTML 畫面
        let html = '';
        if (top5.length === 0) {
            html = '<p style="text-align: center; color: #94a3b8; font-size: 13px;">目前還沒有人有積分喔！</p>';
        } else {
            top5.forEach((p, index) => {
                let bg = index === 0 ? "linear-gradient(135deg, #fef08a, #fde047)" : 
                         index === 1 ? "linear-gradient(135deg, #e2e8f0, #cbd5e1)" : 
                         index === 2 ? "linear-gradient(135deg, #fed7aa, #fdba74)" : "#ffffff";
                let textColor = index < 3 ? "#854d0e" : "#475569";
                let border = index < 3 ? "none" : "1px solid #cbd5e1";

                html += `
                <div style="background: ${bg}; border: ${border}; padding: 12px 15px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 20px;">${medals[index]}</span>
                        <strong style="color: ${textColor}; font-size: 15px;">${anonymousNames[index]}</strong>
                    </div>
                    <div style="font-size: 18px; font-weight: bold; color: ${textColor};">
                        ${p.points} <span style="font-size: 12px; font-weight: normal;">分</span>
                    </div>
                </div>
                `;
            });
        }

        listContainer.innerHTML = html;
    });
}