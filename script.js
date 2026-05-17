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
            showScreen('end-screen');
            document.getElementById('user-bar').style.display = 'none';
            document.getElementById('main-header').style.display = 'none';

            // ======== 🌟 補回被誤殺的：玩家個人的最終成績 ========
            const myData = players[myUid];
            if (myData) {
                // 💡 提醒：這裡的 getElementById 請確認是否跟你 HTML 裡的 ID 一致
                // 如果你的 ID 不同 (例如叫 final-angel)，請直接修改單引號裡面的名稱！
                
                let myScoreEl = document.getElementById('final-score');
                if (myScoreEl) myScoreEl.innerText = myData.total_points || 0;
            }
            // ===================================================

            // ======== 🌟 第一步：整理全體玩家資料 (與後台同步) ========
            const allPlayers = Object.entries(players).map(([uid, p]) => ({
                uid: uid,
                name: p.name || '未知玩家',
                total_points: p.total_points || 0,
                vAngel: p.verified_angel_tasks || 0,
                vDemon: p.verified_demon_tasks || 0,
                fAngel: p.failed_angel_tasks || 0,   
                fDemon: p.failed_demon_tasks || 0,   
                tMails: p.total_mails_sent || 0,     
                gAngel: p.times_guessed_as_angel || 0,
                gDemon: p.times_guessed_as_demon || 0
            }));

            // ======== 🌟 第二步：套用後台管理員的「精準計算大腦」 ========
            // 1. 🏆 營隊 MVP：【雙棲特務門檻】必須天/惡任務都至少成功過 1 次，才有資格比總分！
            const validMvps = allPlayers.filter(p => p.vAngel > 0 && p.vDemon > 0);

            // 如果有人達標，就從達標的人裡面挑總分最高的；如果全營隊都超雷沒人達標，才退回比全體總分
            const mvp = validMvps.length > 0 
                ? validMvps.sort((a, b) => b.total_points - a.total_points)[0]
                : [...allPlayers].sort((a, b) => b.total_points - a.total_points)[0];

            // 2. 👼 最佳小天使：【開根號防刷分 + 命中率加權模型】
            const validAngels = allPlayers.filter(p => (p.vAngel + p.fAngel + p.tMails) > 0);
            const bestAngel = validAngels.length > 0 
                ? validAngels.sort((a, b) => {
                    // 基礎分：任務苦勞 + 信件開根號
                    let baseA = (a.vAngel * 25) + (a.fAngel * 10) + (Math.sqrt(a.tMails) * 20);
                    let baseB = (b.vAngel * 25) + (b.fAngel * 10) + (Math.sqrt(b.tMails) * 20);
                    
                    // 命中率乘數 (0.5 ~ 1.0)
                    let totalTasksA = a.vAngel + a.fAngel;
                    let multA = totalTasksA > 0 ? 0.5 + 0.5 * (a.vAngel / totalTasksA) : 1;
                    
                    let totalTasksB = b.vAngel + b.fAngel;
                    let multB = totalTasksB > 0 ? 0.5 + 0.5 * (b.vAngel / totalTasksB) : 1;
                    
                    let scoreA = baseA * multA;
                    let scoreB = baseB * multB;
                    
                    return scoreB - scoreA || b.total_points - a.total_points;
                })[0]
                : null;

            // 3. 😈 最佳小惡魔：【命中率加權模型】(惡魔不看信件，只看整人成功率)
            const validDemons = allPlayers.filter(p => (p.vDemon + p.fDemon) > 0);
            const bestDemon = validDemons.length > 0 
                ? validDemons.sort((a, b) => {
                    let baseA = (a.vDemon * 25) + (a.fDemon * 10);
                    let baseB = (b.vDemon * 25) + (b.fDemon * 10);
                    
                    let totalTasksA = a.vDemon + a.fDemon;
                    let multA = totalTasksA > 0 ? 0.5 + 0.5 * (a.vDemon / totalTasksA) : 1;
                    
                    let totalTasksB = b.vDemon + b.fDemon;
                    let multB = totalTasksB > 0 ? 0.5 + 0.5 * (b.vDemon / totalTasksB) : 1;
                    
                    let scoreA = baseA * multA;
                    let scoreB = baseB * multB;
                    
                    return scoreB - scoreA || b.total_points - a.total_points;
                })[0]
                : null;

                // 4. 👻 最佳隱形天使：【指數衰減模型】(活躍度) × (0.6 的被抓次方)
                const validInvAngels = allPlayers.filter(p => p.vAngel > 0); 
                const bestInvAngel = validInvAngels.length > 0 
                ? validInvAngels.sort((a, b) => {
                    // 你的專屬活躍度公式 (出擊25 + 默默15 + 寫信5)
                    let baseA = (a.vAngel * 25) + (a.fAngel * 15) + (a.tMails * 5);
                    let baseB = (b.vAngel * 25) + (b.fAngel * 15) + (b.tMails * 5);
                    
                    // 指數衰減：Math.pow(0.6, 次數) 
                    let scoreA = baseA * Math.pow(0.6, a.gAngel);
                    let scoreB = baseB * Math.pow(0.6, b.gAngel);
                    
                    return scoreB - scoreA || b.total_points - a.total_points;
                })[0]
                : null;

                // 5. 🥷 最佳隱形惡魔：【指數衰減模型】(活躍度) × (0.6 的被抓次方)
                const validInvDemons = allPlayers.filter(p => p.vDemon > 0); 
                const bestInvDemon = validInvDemons.length > 0 
                ? validInvDemons.sort((a, b) => {
                    // 惡魔活躍度 (出擊25 + 默默15)
                    let baseA = (a.vDemon * 25) + (a.fDemon * 15);
                    let baseB = (b.vDemon * 25) + (b.fDemon * 15);
                    
                    // 指數衰減
                    let scoreA = baseA * Math.pow(0.6, a.gDemon);
                    let scoreB = baseB * Math.pow(0.6, b.gDemon);
                    
                    return scoreB - scoreA || b.total_points - a.total_points;
                })[0]
                : null;

            // ======== 🌟 第三步：準備印出前端的 3D 翻牌卡片 ========
            const currentWinners = [
                { title: '🏆 營隊 MVP', player: mvp, sub: `總積分: ${mvp ? mvp.total_points : 0} 分`, color: '#f59e0b' },
                // 👼 小天使字卡
                { 
                    title: '👼 最佳小天使', 
                    player: bestAngel, 
                    sub: bestAngel ? `綜合評分: ${Math.round(((bestAngel.vAngel * 25) + (bestAngel.fAngel * 10) + (Math.sqrt(bestAngel.tMails) * 20)) * (bestAngel.vAngel + bestAngel.fAngel > 0 ? 0.5 + 0.5 * (bestAngel.vAngel / (bestAngel.vAngel + bestAngel.fAngel)) : 1))} (成功率${Math.round((bestAngel.vAngel / (bestAngel.vAngel + bestAngel.fAngel || 1)) * 100)}%)` : '尚無人選', 
                    color: '#3b82f6' 
                },
                // 😈 小惡魔字卡
                { 
                    title: '😈 最佳小惡魔', 
                    player: bestDemon, 
                    sub: bestDemon ? `綜合評分: ${Math.round(((bestDemon.vDemon * 25) + (bestDemon.fDemon * 10)) * (bestDemon.vDemon + bestDemon.fDemon > 0 ? 0.5 + 0.5 * (bestDemon.vDemon / (bestDemon.vDemon + bestDemon.fDemon)) : 1))} (成功率${Math.round((bestDemon.vDemon / (bestDemon.vDemon + bestDemon.fDemon || 1)) * 100)}%)` : '尚無人選', 
                    color: '#ef4444' 
                },
                { 
                    title: '👻 最佳隱形天使', 
                    player: bestInvAngel, 
                    // 把小數點四捨五入到整數 Math.round()
                    sub: bestInvAngel ? `潛行評分: ${Math.round(((bestInvAngel.vAngel * 25) + (bestInvAngel.fAngel * 15) + (bestInvAngel.tMails * 5)) * Math.pow(0.6, bestInvAngel.gAngel))} (被猜中${bestInvAngel.gAngel}次)` : '尚無人選', 
                    color: '#8b5cf6' 
                },
                { 
                    title: '🥷 最佳隱形惡魔', 
                    player: bestInvDemon, 
                    sub: bestInvDemon ? `潛行評分: ${Math.round(((bestInvDemon.vDemon * 25) + (bestInvDemon.fDemon * 15)) * Math.pow(0.6, bestInvDemon.gDemon))} (被猜中${bestInvDemon.gDemon}次)` : '尚無人選', 
                    color: '#10b981' 
                }
            ];

            let awardHtml = '';
            currentWinners.forEach(award => {
                let name = award.player ? award.player.name : '尚無人選';
                awardHtml += `
                <div class="swiper-slide">
                    <div class="flip-card" onclick="this.classList.toggle('flipped')">
                        <div class="flip-card-inner">
                            <div class="flip-card-front" style="border: 2px solid ${award.color};">
                                <div style="font-size: 14px; color: #64748b; margin-bottom: 8px; font-weight: bold;">${award.title}</div>
                                <div style="font-size: 24px; font-weight: bold; color: #334155; margin-bottom: 12px;">???</div>
                                <div style="font-size: 12px; color: white; background: ${award.color}; padding: 4px 10px; border-radius: 12px; display: inline-block;">點擊揭曉</div>
                            </div>
                            <div class="flip-card-back" style="background: ${award.color};">
                                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">${award.title}</div>
                                <div style="font-size: 26px; font-weight: bold; margin-bottom: 8px; text-shadow: 1px 1px 2px rgba(0,0,0,0.2);">${name}</div>
                                <div style="font-size: 13px; opacity: 0.9; background: rgba(0,0,0,0.15); padding: 4px 10px; border-radius: 12px; display: inline-block;">${award.sub}</div>
                            </div>
                        </div>
                    </div>
                </div>
                `;
            });

            // 將組裝好的卡片塞入 Swiper 容器的 Wrapper 裡面
            const swiperWrapper = document.querySelector('.award-swiper .swiper-wrapper');
            if (swiperWrapper) {
                swiperWrapper.innerHTML = awardHtml;
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

            // 發動引擎！
            initAwardSwiper();

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
            // document.getElementById('angel-target-display').innerText = players[myUid].identity.angel_to_name || "無";
            // document.getElementById('demon-target-display').innerText = players[myUid].identity.demon_to_name || "無";
            // 🕵️‍♂️ 防偷看機制：把名字藏在 dataset 裡，畫面顯示預設文字
            const angelEl = document.getElementById('angel-target-display');
            const demonEl = document.getElementById('demon-target-display');
            
            if (angelEl && demonEl) {
                angelEl.dataset.name = players[myUid].identity.angel_to_name || "無";
                angelEl.innerText = "🤫 按住查看";
                
                demonEl.dataset.name = players[myUid].identity.demon_to_name || "無";
                demonEl.innerText = "🤫 按住查看";
            }
            
            updateSelects(players);
            

            // 🌟 確保這段程式碼有放在 startSync() 裡面，當遊戲啟動時執行
            const receiverSelect = document.getElementById('mail-receiver-select');
            if (receiverSelect) {
                receiverSelect.innerHTML = '<option value="">-- 請選擇寄信對象 --</option>';
                Object.keys(players).forEach(uid => {
                    // 排除自己，這樣寄信的對象就只會是「其他玩家」
                    if (uid !== myUid) {
                        const option = document.createElement('option');
                        option.value = uid;
                        option.textContent = players[uid].name;
                        receiverSelect.appendChild(option);
                    }
                });
            }

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

    // 匿名信箱即時監聽 (支援動態顯示匿名/實名)
    db.ref('messages').on('value', (snap) => {
        const list = document.getElementById('mailbox-list');
        if(!list) return;
        list.innerHTML = '<h3>📥 我的收件匣</h3>';
        if (snap.exists()) {
            Object.values(snap.val()).reverse().forEach(m => {
                if (m.to === myUid) {
                    const div = document.createElement('div');
                    
                    const displaySender = m.senderName || '匿名'; 
                    if(displaySender == '匿名'){
                        div.style = "background:#f1f5f9; padding:10px; border-radius:8px; margin-bottom:10px; border-left:4px solid var(--primary);";
                        div.innerHTML = `${m.content}<br><small style="color:#876B8A">👻來自：${displaySender} • ${m.time}</small>`;
                        list.appendChild(div);
                    }
                    else{ 
                        div.style = "background:#F9F1F9   ; padding:10px; border-radius:8px; margin-bottom:10px; border-left:4px solid var(--primary);";
                        div.innerHTML = `${m.content}<br><small style="color:#876B8A">🙂來自：${displaySender} • ${m.time}</small>`;
                        list.appendChild(div);
                    }
                        // 🌟 核心修改：如果信件有 senderName 就用它，沒有的話（相容舊信件）就顯示 '匿名'


                    // 把原本寫死的 '來自：匿名' 換成 ${displaySender}
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
    
    // 🌟 抓取目前選單是選擇匿名還是實名
    const anonymousSelect = document.getElementById('mail-anonymous-select');
    const isAnonymous = anonymousSelect ? anonymousSelect.value === 'true' : true; // 防呆預設匿名

    if (!to || !content) return alert("請選擇收件人並填寫內容");
    
    // 1. 將信件推送到資料庫 (新增 senderName 欄位)
    db.ref('messages').push({ 
        to: to, 
        content: content, 
        time: new Date().toLocaleTimeString(),
        // 🌟 核心：匿名就填"匿名"，實名就填"你的名字"
        senderName: isAnonymous ? "匿名" : myName
    });
    
    // 2. 紀錄今天發了幾封信 (維持你原本的邏輯)
    db.ref(`players/${myUid}/daily_mails_sent`).transaction(count => {
        return (count || 0) + 1;
    });
    
    // 3. 清空輸入框並提示玩家
    document.getElementById('mail-msg').value = '';
    alert("信件已送出！積分將於今晚結算時統一發放。");
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
            res += `👤 ${p[id].name} 是 ${p[id].identity.angel_to_name} 的小天使 |  ${p[id].identity.demon_to_name} 的小惡魔\n`;
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
// 🌟 升級：監聽整個根目錄
    db.ref('/').on('value', (snap) => {
        const tbody = document.getElementById('admin-monitor');
        if (!tbody) return; 
        
        tbody.innerHTML = ''; // 清空舊畫面
        const data = snap.val() || {};
        const players = data.players || {};
        const config = data.camp_config || {};
        const settleCount = config.settle_count || 0;

        if (Object.keys(players).length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">目前無玩家資料</td></tr>';
            return;
        }

        // ======== 🌟 第一步：先將玩家資料轉成好用的陣列 ========
        const allPlayers = Object.entries(players).map(([uid, p]) => ({
            uid: uid,
            name: p.name || '未知玩家',
            total_points: p.total_points || 0,
            password: p.password || '無',
            vAngel: p.verified_angel_tasks || 0,
            vDemon: p.verified_demon_tasks || 0,
            fAngel: p.failed_angel_tasks || 0,   
            fDemon: p.failed_demon_tasks || 0,   
            cGuess: p.correct_guesses || 0,
            pAngel: p.passive_angel_tasks || 0,
            pDemon: p.passive_demon_tasks || 0,
            tMails: p.total_mails_sent || 0,     
            gAngel: p.times_guessed_as_angel || 0,
            gDemon: p.times_guessed_as_demon || 0
        }));

        // ======== 🌟 第二步：為 5 大獎項量身打造「獨立排序邏輯」 ========
        // 1. 🏆 營隊 MVP：【雙棲特務門檻】必須天/惡任務都至少成功過 1 次，才有資格比總分！
            const validMvps = allPlayers.filter(p => p.vAngel > 0 && p.vDemon > 0);

            // 如果有人達標，就從達標的人裡面挑總分最高的；如果全營隊都超雷沒人達標，才退回比全體總分
            const mvp = validMvps.length > 0 
                ? validMvps.sort((a, b) => b.total_points - a.total_points)[0]
                : [...allPlayers].sort((a, b) => b.total_points - a.total_points)[0];
        
        // 2. 👼 最佳小天使：【開根號防刷分 + 命中率加權模型】
            const validAngels = allPlayers.filter(p => (p.vAngel + p.fAngel + p.tMails) > 0);
            const bestAngel = validAngels.length > 0 
                ? validAngels.sort((a, b) => {
                    // 基礎分：任務苦勞 + 信件開根號
                    let baseA = (a.vAngel * 25) + (a.fAngel * 10) + (Math.sqrt(a.tMails) * 20);
                    let baseB = (b.vAngel * 25) + (b.fAngel * 10) + (Math.sqrt(b.tMails) * 20);
                    
                    // 命中率乘數 (0.5 ~ 1.0)
                    let totalTasksA = a.vAngel + a.fAngel;
                    let multA = totalTasksA > 0 ? 0.5 + 0.5 * (a.vAngel / totalTasksA) : 1;
                    
                    let totalTasksB = b.vAngel + b.fAngel;
                    let multB = totalTasksB > 0 ? 0.5 + 0.5 * (b.vAngel / totalTasksB) : 1;
                    
                    let scoreA = baseA * multA;
                    let scoreB = baseB * multB;
                    
                    return scoreB - scoreA || b.total_points - a.total_points;
                })[0]
                : null;

            // 3. 😈 最佳小惡魔：【命中率加權模型】(惡魔不看信件，只看整人成功率)
            const validDemons = allPlayers.filter(p => (p.vDemon + p.fDemon) > 0);
            const bestDemon = validDemons.length > 0 
                ? validDemons.sort((a, b) => {
                    let baseA = (a.vDemon * 25) + (a.fDemon * 10);
                    let baseB = (b.vDemon * 25) + (b.fDemon * 10);
                    
                    let totalTasksA = a.vDemon + a.fDemon;
                    let multA = totalTasksA > 0 ? 0.5 + 0.5 * (a.vDemon / totalTasksA) : 1;
                    
                    let totalTasksB = b.vDemon + b.fDemon;
                    let multB = totalTasksB > 0 ? 0.5 + 0.5 * (b.vDemon / totalTasksB) : 1;
                    
                    let scoreA = baseA * multA;
                    let scoreB = baseB * multB;
                    
                    return scoreB - scoreA || b.total_points - a.total_points;
                })[0]
                : null;
        
            // 4. 👻 最佳隱形天使：【指數衰減模型】(活躍度) × (0.6 的被抓次方)
            const validInvAngels = allPlayers.filter(p => p.vAngel > 0); 
            const bestInvAngel = validInvAngels.length > 0 
                ? validInvAngels.sort((a, b) => {
                    // 你的專屬活躍度公式 (出擊25 + 默默15 + 寫信5)
                    let baseA = (a.vAngel * 25) + (a.fAngel * 15) + (a.tMails * 5);
                    let baseB = (b.vAngel * 25) + (b.fAngel * 15) + (b.tMails * 5);
                    
                    // 指數衰減：Math.pow(0.6, 次數) 
                    let scoreA = baseA * Math.pow(0.6, a.gAngel);
                    let scoreB = baseB * Math.pow(0.6, b.gAngel);
                    
                    return scoreB - scoreA || b.total_points - a.total_points;
                })[0]
                : null;

            // 5. 🥷 最佳隱形惡魔：【指數衰減模型】(活躍度) × (0.6 的被抓次方)
            const validInvDemons = allPlayers.filter(p => p.vDemon > 0); 
            const bestInvDemon = validInvDemons.length > 0 
                ? validInvDemons.sort((a, b) => {
                    // 惡魔活躍度 (出擊25 + 默默15)
                    let baseA = (a.vDemon * 25) + (a.fDemon * 15);
                    let baseB = (b.vDemon * 25) + (b.fDemon * 15);
                    
                    // 指數衰減
                    let scoreA = baseA * Math.pow(0.6, a.gDemon);
                    let scoreB = baseB * Math.pow(0.6, b.gDemon);
                    
                    return scoreB - scoreA || b.total_points - a.total_points;
                })[0]
                : null;

        // ======== 🌟 第三步：更新預測面板 ========
        const currentWinners = [
            { title: '🏆 營隊 MVP', player: mvp, sub: `${mvp ? mvp.total_points : 0} 分` },
            // 🌟 顯示暖心指數與詳細貢獻
            // 👼 小天使字卡
                { 
                    title: '👼 最佳小天使', 
                    player: bestAngel, 
                    sub: bestAngel ? `綜合評分: ${Math.round(((bestAngel.vAngel * 25) + (bestAngel.fAngel * 10) + (Math.sqrt(bestAngel.tMails) * 20)) * (bestAngel.vAngel + bestAngel.fAngel > 0 ? 0.5 + 0.5 * (bestAngel.vAngel / (bestAngel.vAngel + bestAngel.fAngel)) : 1))} (成功率${Math.round((bestAngel.vAngel / (bestAngel.vAngel + bestAngel.fAngel || 1)) * 100)}%)` : '尚無人選', 
                    color: '#3b82f6' 
                },
                // 😈 小惡魔字卡
                { 
                    title: '😈 最佳小惡魔', 
                    player: bestDemon, 
                    sub: bestDemon ? `綜合評分: ${Math.round(((bestDemon.vDemon * 25) + (bestDemon.fDemon * 10)) * (bestDemon.vDemon + bestDemon.fDemon > 0 ? 0.5 + 0.5 * (bestDemon.vDemon / (bestDemon.vDemon + bestDemon.fDemon)) : 1))} (成功率${Math.round((bestDemon.vDemon / (bestDemon.vDemon + bestDemon.fDemon || 1)) * 100)}%)` : '尚無人選', 
                    color: '#ef4444' 
                },
            // 🌟 明確顯示「每日猜猜看」的被猜中次數
            { 
                    title: '👻 最佳隱形天使', 
                    player: bestInvAngel, 
                    // 把小數點四捨五入到整數 Math.round()
                    sub: bestInvAngel ? `潛行評分: ${Math.round(((bestInvAngel.vAngel * 25) + (bestInvAngel.fAngel * 15) + (bestInvAngel.tMails * 5)) * Math.pow(0.6, bestInvAngel.gAngel))} (被猜中${bestInvAngel.gAngel}次)` : '尚無人選', 
                    color: '#8b5cf6' 
                },
                { 
                    title: '🥷 最佳隱形惡魔', 
                    player: bestInvDemon, 
                    sub: bestInvDemon ? `潛行評分: ${Math.round(((bestInvDemon.vDemon * 25) + (bestInvDemon.fDemon * 15)) * Math.pow(0.6, bestInvDemon.gDemon))} (被猜中${bestInvDemon.gDemon}次)` : '尚無人選', 
                    color: '#10b981' 
                }
        ];

        let awardHtml = '';
        currentWinners.forEach(award => {
            let name = award.player ? award.player.name : '尚無人選';
            awardHtml += `
                <div style="background: white; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; flex: 1 1 calc(33% - 10px); min-width: 140px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                    <div style="font-weight: bold; color: #475569; margin-bottom: 4px; font-size: 12px;">${award.title}</div>
                    <div style="color: #6366f1; font-size: 15px;"><b>${name}</b> <span style="color:#94a3b8; font-size:12px;">(${award.sub})</span></div>
                </div>
            `;
        });

        const winnerBoard = document.getElementById('admin-winner-board');
        if (winnerBoard) {
            const awardList = winnerBoard.querySelector('#award-list');
            if (awardList) {
                awardList.innerHTML = awardHtml;
            } else {
                 winnerBoard.innerHTML = awardHtml;
            }
        }

        // ======== 🌟 第四步：畫出管理員的監控大表格 ========
        const dayIndicator = document.getElementById('admin-day-indicator');
        if (dayIndicator) {
            dayIndicator.innerHTML = `📅 <b>活動進度：第 ${settleCount + 1} 天</b> (目前已成功執行 ${settleCount} 次積分結算)`;
        }

        // 表格依照總分排序
        allPlayers.sort((a, b) => b.total_points - a.total_points);

        allPlayers.forEach((p, index) => {
            const tr = document.createElement('tr');
            let medal = index === 0 ? '🥇 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : '';
            
            // ... (這裡保留你原本組合 breakdownHTML 和 tr.innerHTML 的程式碼) ...
            let breakdownHTML = `
                <div style="font-size: 11px; text-align: left; color: #475569; line-height: 1.4; padding: 2px 0;">
                    <span style="color:#10b981; font-weight:bold;">✅ 出擊成功(天/惡)(+25): ${p.vAngel} / ${p.vDemon} 次</span><br>
                    <span style="color:#0ea5e9; font-weight:bold;">🎯 盲測接收(天/惡)(+25): ${p.pAngel} / ${p.pDemon} 次</span><br>
                    <span style="color:#ef4444;">❌ 默默付出(天/惡)(+10): ${p.fAngel} / ${p.fDemon} 次</span><br>
                    <span style="color:#f59e0b; font-weight:bold;">💡 猜中身分(+20): ${p.cGuess} 次</span><br>
                    <span style="color:#8b5cf6;">📨 匿名信(+2): ${p.tMails} 封</span><br>
                    <span style="color:#64748b;">🥷 完美潛伏(天/惡)(+15): ${settleCount - p.gAngel } / ${settleCount - p.gDemon} 次</span>
                </div>
            `;

            tr.innerHTML = `
                <td style="font-weight: bold;">${medal}${p.name}</td>
                <td style="font-weight:bold; color: #059669; font-size: 15px;">${p.total_points} 分</td>
                <td style="color:#475569; font-family: monospace; font-weight: bold;">${p.password}</td>
                <td style="background: #fafafa; padding: 6px; border-left: 3px solid #6366f1;">${breakdownHTML}</td>
                <td>
                    <button onclick="adjustScore('${p.uid}', -10)" style="background:#ef4444; color:white; padding:4px; font-size:10px; width:auto; margin:0;">扣10分</button>
                </td>
                <td>
                    <button onclick="deletePlayer('${p.uid}')" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:12px;">刪除</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
}
// --- 盲測拼圖核心邏輯 ---

// ==========================================
// --- 管理員：步驟 1. 載入任務並進行審核 ---
// ==========================================
function loadTasksForAdmin() {
    db.ref('/').once('value', snap => {
        const data = snap.val() || {};
        const events = data.daily_events;
        const players = data.players || {}; 
        
        const reviewBox = document.getElementById('admin-task-review');
        const listDiv = document.getElementById('review-list');
        
        if (reviewBox) reviewBox.style.display = 'block';
        if (!listDiv) return;
        
        listDiv.innerHTML = '';

        if (!events) {
            listDiv.innerHTML = '<div style="text-align:center; color:#ef4444; padding: 10px;">今日尚無任何任務提交。</div>';
            return;
        }

        // 建立精美的任務審核卡片
        for (let eventId in events) {
            const ev = events[eventId];
            if (!ev || !ev.task) continue; // 防呆
            
            const actorName = players[ev.actor] ? players[ev.actor].name : '未知';
            const targetName = players[ev.target] ? players[ev.target].name : '未知';
            const typeLabel = ev.type === 'angel' ? '👼 天使' : '😈 惡魔';
            const taskStr = ev.task || '';

            // 卡片外框
            const card = document.createElement('div');
            card.style.cssText = "margin-bottom: 15px; padding: 6px; background: #ffffff; border: 2px solid #e2e8f0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 5px;";

            // --- 第一排：勾選框 + 原始任務資訊 ---
            const topRow = document.createElement('div');
            topRow.style.cssText = "display: flex; align-items: flex-start; gap: 10px;";

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'task-publish-repo';
            cb.dataset.eventId = eventId;
            cb.checked = true;
            cb.style.cssText = "width: 20%; cursor: pointer; transform: scale(1.3); margin-top: 4px;";

            const infoSpan = document.createElement('span');
            infoSpan.style.cssText = "width: 10px,font-size: 13px; color: #475569; line-height: 1.5;";
            infoSpan.innerHTML = `<strong>${typeLabel}</strong> <span style="color:#3b82f6;">${actorName}</span> ➔ <span style="color:#ef4444;">${targetName}</span><br>🔍 原始行為：<b style="color:#0f172a; font-size: 14px;">${taskStr}</b>`;

            topRow.appendChild(cb);
            topRow.appendChild(infoSpan);

            // --- 第二排：明確的編輯輸入區 ---
            const bottomRow = document.createElement('div');
            // bottomRow.style.cssText = "display: flex; align-items: center; gap: 8px; margin-left: 25px; margin-top: 5px;";
            bottomRow.style.cssText = "display: flex; align-items: flex-start; gap: 8px; margin-left: 25px; margin-top: 5px;";

            const editIcon = document.createElement('span');
            editIcon.innerText = "✏️ 統一改為:";
            editIcon.style.cssText = "font-size: 13px; font-weight: bold; color: #10b981; white-space: nowrap;";

            const input = document.createElement('textarea');
            // input.type = 'text';
            input.className = 'task-edit-input';
            input.dataset.eventId = eventId;
            input.value = taskStr; // 預設先幫你填入原始文字，方便你直接小修改
            input.placeholder = "請輸入統一後的任務名稱...";
            // 加強輸入框樣式，確保絕對可以點擊編輯
            input.style.cssText = "flex: 1; padding: 8px 12px; border: 2px solid #cbd5e1; border-radius: 6px; font-size: 14px; color: #0f172a; background: #f8fafc; outline: none; cursor: text; pointer-events: auto;";
            
            // 點擊時的高光特效 (提升操作手感)
            input.onfocus = () => { input.style.border = "2px solid #3b82f6"; input.style.background = "#ffffff"; };
            input.onblur = () => { input.style.border = "2px solid #cbd5e1"; input.style.background = "#f8fafc"; };
            
            // 🌟 新增：專屬的「確定」儲存按鈕
            const saveBtn = document.createElement('button');
            saveBtn.innerText = "確定";
            // 獨立按鈕樣式，寬度隨內容撐開，與輸入框頂部保持微調間距
            saveBtn.style.cssText = "background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; white-space: nowrap; width: auto; margin: 0; margin-top: 2px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);";

            // 🌟 點擊「確定」事件：直接即時寫入 Firebase 資料庫
            saveBtn.onclick = () => {
                const newText = input.value.trim();
                if (!newText) {
                    alert("❌ 錯誤：任務名稱不能為空！");
                    return;
                }
                
                // 悄悄去雲端更新這一條日常任務的名稱
                db.ref(`daily_events/${eventId}`).update({ task: newText }).then(() => {
                    // 特效：讓框框閃爍一下綠色高光，提示儲存成功，免去煩人的 alert 彈窗影響操作速度
                    input.style.border = "2px solid #10b981";
                    saveBtn.innerText = "✓ 已存";
                    saveBtn.style.background = "#059669";
                    
                    setTimeout(() => {
                        input.style.border = "2px solid #cbd5e1";
                        saveBtn.innerText = "確定";
                        saveBtn.style.background = "#10b981";
                    }, 1200);
                }).catch(err => {
                    alert("❌ 儲存失敗，請檢查網路：" + err.message);
                });
            };
            bottomRow.appendChild(editIcon);
            bottomRow.appendChild(input);
            bottomRow.appendChild(saveBtn);

            card.appendChild(topRow);
            card.appendChild(bottomRow);
            listDiv.appendChild(card);
        }
    });
}

// 管理員手動加入煙霧彈 (假任務)
function addFakeTask() {
    const input = document.getElementById('fake-task-input');
    const taskText = input.value.trim();
    if (!taskText) {
        alert('請先輸入假任務內容！');
        return;
    }

    const li = document.createElement('div'); // 改成 div 比較好排版
    li.style.marginBottom = '8px';
    li.style.color = '#8b5cf6';

    li.innerHTML = `
        <label style="cursor: pointer;">
            <input type="checkbox" class="task-checkbox" value="${taskText}" checked> 
            <b>[煙霧彈]</b> ${taskText}
        </label>
    `;
    
    // 🌟 關鍵修改：直接把假任務插在輸入框的父元素前面！
    input.parentElement.parentNode.insertBefore(li, input.parentElement);
    
    input.value = ''; // 清空輸入框
}

// ==========================================
// --- 管理員：步驟 2. 發布任務並觸發盲測 ---
// ==========================================
function publishAndStartSettlement() {
    if (!confirm("📢 確定要發布這些勾選的任務，並強制全體玩家進入盲測作答嗎？")) return;

    const checkboxes = document.querySelectorAll('.task-publish-repo');
    let checkedTasksSet = new Set(); 
    let updates = {};

    checkboxes.forEach(checkbox => {
        const eventId = checkbox.dataset.eventId;
        const inputEl = document.querySelector(`.task-edit-input[data-event-id="${eventId}"]`);
        
        if (!inputEl) return;
        const finalTaskName = inputEl.value.trim(); 
        
        if (!finalTaskName) return; 

        if (checkbox.checked) {
            checkedTasksSet.add(finalTaskName);
            // 將玩家原始任務覆蓋為管理員編輯後的統一名稱
            updates[`daily_events/${eventId}/task`] = finalTaskName;
        } else {
            // 取消勾選則視為捨棄該任務
            updates[`daily_events/${eventId}`] = null;
        }
    });

    // ======== 🌟 關鍵補丁：從畫面上抓取我們剛才產生的「假任務(煙霧彈)」 ========
    const fakeCheckboxes = document.querySelectorAll('.task-checkbox:checked');
    fakeCheckboxes.forEach(cb => {
        if (cb.value) {
            checkedTasksSet.add(cb.value.trim()); // 把假任務也塞進去重名單中
        }
    });
    // ======================================================================

    // 處理資料庫中可能殘留的假任務 (保留你原本的邏輯防呆)
    db.ref('fake_tasks').once('value', fakeSnap => {
        if (fakeSnap.exists()) {
            Object.values(fakeSnap.val()).forEach(fakeTask => {
                if (fakeTask) checkedTasksSet.add(fakeTask.trim()); 
            });
        }

        const finalChecklistOptions = Array.from(checkedTasksSet);

        if (finalChecklistOptions.length === 0) {
            alert("❌ 錯誤：發布清單是空的！請至少勾選一個玩家任務或加入一個假任務。");
            return;
        }

        updates['camp_config/daily_checklist'] = finalChecklistOptions; 
        updates['camp_config/status'] = 'daily_settlement';            
        updates['fake_tasks'] = null;                                  

        db.ref().update(updates).then(() => {
            alert(`✅ 發布成功！系統已將任務去重合併為 [ ${finalChecklistOptions.length} ] 個選項，玩家畫面已切換至結算！`);
        });
    });
}

// ==========================================
// --- 玩家端：載入「審核過」的拼圖清單 ---
// ==========================================
// (這個函數會被 startSync 在進入 daily_settlement 狀態時自動呼叫)
function loadDailyChecklist() {
    db.ref('camp_config/daily_checklist').once('value', snap => {
        const list = snap.val() || [];
        const container = document.getElementById('checklist-container');
        
        if (!container) return; // 防呆
        container.innerHTML = ''; // 清空舊畫面

        if (list.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#94a3b8; padding: 20px;">今日無拼圖選項。</div>';
            return;
        }

        // 🌟 使用最安全的 createElement 來畫出每一個選項
        list.forEach((taskStr) => {
            if (!taskStr) return;

            // 建立外層的點擊標籤 (Label)
            const label = document.createElement('label');
            label.style.cssText = "display: block; margin-bottom: 10px; padding: 12px 15px; background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 8px; cursor: pointer; font-size: 15px; color: #1e293b; transition: all 0.2s ease;";
            
            // 建立勾選方塊 (Checkbox)
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'daily-task-cb'; // ⚠️ 重要：保留這個 class 讓送出功能可以抓到
            cb.value = taskStr; // 透過屬性安全賦值，100% 免疫引號與特殊符號破壞
            cb.style.cssText = "margin-right: 12px; transform: scale(1.3); cursor: pointer;";

            // ✨ 加入 UI 特效：點擊時外框變色，讓玩家知道自己勾了什麼
            cb.onchange = function() {
                if (this.checked) {
                    label.style.background = "#eff6ff";
                    label.style.border = "2px solid #3b82f6";
                } else {
                    label.style.background = "#f8fafc";
                    label.style.border = "2px solid #e2e8f0";
                }
            };

            // 建立純文字節點 (確保任何奇怪的字元都會被當成純文字顯示)
            const textNode = document.createTextNode(taskStr);

            // 組裝選項並放進畫面
            label.appendChild(cb);
            label.appendChild(textNode);
            container.appendChild(label);
        });
    });
}
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
        const data = snap.val() || {};
        const events = data.daily_events || {};
        const players = data.players || {};
        // 抓出原本的累積結算次數 (防呆預設為 0)
        const currentSettleCount = (data.camp_config && data.camp_config.settle_count) ? data.camp_config.settle_count : 0;
        
        let updates = {};
        let trueAngels = {}; 
        let trueDemons = {}; 

        for (let uid in players) {
            if (players[uid].identity) {
                trueAngels[players[uid].identity.angel_to] = uid;
                trueDemons[players[uid].identity.demon_to] = uid;
            }
            updates[`players/${uid}/total_points`] = players[uid].total_points || 0;
        }

        // --- 1. 結算盲測拼圖 (日常任務) ---
        for (let eventId in events) {
            const ev = events[eventId];
            if (!ev || !ev.actor || !ev.target || !ev.task) continue; 
            
            const actorId = ev.actor;
            const targetId = ev.target;
            const taskName = ev.task;
            
            const targetChecked = (players[targetId] && players[targetId].daily_checked) ? players[targetId].daily_checked : [];
            const isMatch = targetChecked.includes(taskName);
            
            if (isMatch) {
                // 成功：雙向奔赴
                updates[`players/${actorId}/total_points`] += 25; 
                updates[`players/${targetId}/total_points`] += 25;
                
                let currentTaskCount = updates[`players/${actorId}/verified_${ev.type}_tasks`] !== undefined ? updates[`players/${actorId}/verified_${ev.type}_tasks`] : (players[actorId][`verified_${ev.type}_tasks`] || 0);
                updates[`players/${actorId}/verified_${ev.type}_tasks`] = currentTaskCount + 1;
            
                // 🌟 2. 新增：紀錄「接收者(目標)」的盲測接收成功次數
                let currentPassiveCount = updates[`players/${targetId}/passive_${ev.type}_tasks`] !== undefined ? updates[`players/${targetId}/passive_${ev.type}_tasks`] : (players[targetId][`passive_${ev.type}_tasks`] || 0);
                updates[`players/${targetId}/passive_${ev.type}_tasks`] = currentPassiveCount + 1;
            } else {
                // 失敗：默默付出
                updates[`players/${actorId}/total_points`] += 10; 
                
                // 🌟 新增：玩家發送卻沒有配對成功 (天使/惡魔任務失敗統計)
                let currentFailedCount = updates[`players/${actorId}/failed_${ev.type}_tasks`] !== undefined ? updates[`players/${actorId}/failed_${ev.type}_tasks`] : (players[actorId][`failed_${ev.type}_tasks`] || 0);
                updates[`players/${actorId}/failed_${ev.type}_tasks`] = currentFailedCount + 1;
            }
        }
        
        // --- 2. 結算今日猜猜看與信箱 ---
        for (let uid in players) {
            let currentPts = updates[`players/${uid}/total_points`] !== undefined ? updates[`players/${uid}/total_points`] : (players[uid].total_points || 0);

            if (players[uid].final_guess && players[uid].has_guessed_today) {
                let guessA = players[uid].final_guess.a;
                let guessD = players[uid].final_guess.d;
                if (guessA === trueAngels[uid]) {
                    currentPts += 20;
                    let cGuess = updates[`players/${uid}/correct_guesses`] !== undefined ? updates[`players/${uid}/correct_guesses`] : (players[uid].correct_guesses || 0);
                    updates[`players/${uid}/correct_guesses`] = cGuess + 1;
                }
                if (guessD === trueDemons[uid]){
                    currentPts += 20;
                    let cGuess = updates[`players/${uid}/correct_guesses`] !== undefined ? updates[`players/${uid}/correct_guesses`] : (players[uid].correct_guesses || 0);
                    updates[`players/${uid}/correct_guesses`] = cGuess + 1;
                }
            }

            let mailsSent = players[uid].daily_mails_sent || 0;
            if (mailsSent > 0) {
                let mailBonus = Math.min(mailsSent * 2, 10); 
                currentPts += mailBonus;
                
                // 🌟 新增：累積全營隊期間該玩家發出的「匿名信總量」
                let totalMails = players[uid].total_mails_sent || 0;
                updates[`players/${uid}/total_mails_sent`] = totalMails + mailsSent;
            }

            updates[`players/${uid}/total_points`] = currentPts;
            updates[`players/${uid}/daily_checked`] = null;
            updates[`players/${uid}/has_guessed_today`] = null;
            updates[`players/${uid}/daily_mails_sent`] = null; 
        }

        // --- 3. 結算完美潛伏 ---
        for (let uid in players) {
            if (players[uid].identity) {
                let myAngelTarget = players[uid].identity.angel_to;
                let myDemonTarget = players[uid].identity.demon_to;

                let angelTargetGuess = (players[myAngelTarget] && players[myAngelTarget].final_guess && players[myAngelTarget].has_guessed_today) ? players[myAngelTarget].final_guess.a : null;
                let demonTargetGuess = (players[myDemonTarget] && players[myDemonTarget].final_guess && players[myDemonTarget].has_guessed_today) ? players[myDemonTarget].final_guess.d : null;

                if (angelTargetGuess !== uid) {
                    updates[`players/${uid}/total_points`] += 15;
                } else {
                    let currentGuessedAsAngel = players[uid].times_guessed_as_angel || 0;
                    updates[`players/${uid}/times_guessed_as_angel`] = currentGuessedAsAngel + 1;
                }

                if (demonTargetGuess !== uid) {
                    updates[`players/${uid}/total_points`] += 15;
                } else {
                    let currentGuessedAsDemon = players[uid].times_guessed_as_demon || 0;
                    updates[`players/${uid}/times_guessed_as_demon`] = currentGuessedAsDemon + 1;
                }
            }

            updates[`players/${uid}/daily_checked`] = null;
            updates[`players/${uid}/has_guessed_today`] = null;
            updates[`players/${uid}/daily_mail_points`] = null; 
            updates[`players/${uid}/has_submitted_checklist`] = null;
        }
        
        updates['daily_events'] = null;
        updates['camp_config/status'] = 'active'; 
        
        // 🌟 新增：結算成功時，將資料庫的天使惡魔天數計數器加 1
        updates['camp_config/settle_count'] = currentSettleCount + 1;
        
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
        alert("⚠️ 請輸入想管理員說的話！");
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
        alert("✅ 訊息已成功發送給管理員！");
        document.getElementById('admin-msg-content').value = ""; // 清空輸入框
    }).catch((error) => {
        console.error("發送失敗:", error);
        alert("❌ 發送失敗，請稍後再試。");
    });
}

// 📨 管理員接收訊息即時監聽
function listenToAdminMessages() {
    console.log("系統：管理員收件匣監聽已啟動...");
    
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
    if (confirm("🚨 確定要清空「管理員收件匣」的所有訊息嗎？此動作無法復原。")) {
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
        const anonymousNames = ["🤫 超強卷王", "👻 潛伏大師", "🥷 隱形殺手", "🕵️ 未知高手", "🎭 幕後黑手"];
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
        if(listContainer){
            listContainer.innerHTML = html;
        }
        
        initAwardSwiper();
    });
}

// ==========================================
// 獨立的 Swiper 啟動器 (防呆防撞版)
// ==========================================
// ==========================================
// 獨立的 Swiper 啟動器 (防當機版)
// ==========================================
function initAwardSwiper() {
    setTimeout(() => {
        try {
            // 如果已經有舊的輪播，先清掉避免打架
            if (window.mySwiper) {
                window.mySwiper.destroy(true, true);
            }
            window.mySwiper = new Swiper('.award-swiper', {
                loop: true,
                centeredSlides: true,
                slidesPerView: 1.4,
                spaceBetween: 15,
                autoplay: {
                    delay: 1000,
                    disableOnInteraction: true,
                },
                speed: 600,
                observer: true,       // 監測畫面顯示
                observeParents: true, // 監測父元素
            });
            console.log("✅ 輪播卡片啟動成功！");
        } catch (error) {
            console.error("🚨 輪播載入失敗，但不影響遊戲：", error);
        }
    }, 500);
}

// ==========================================
// 🕵️‍♂️ 防偷看：長按顯形機制 (指紋解鎖模式)
// ==========================================
function setupSecretTargets() {
    const targets = ['angel-target-display', 'demon-target-display'];
    
    targets.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        // 🟢 動作：手指按住 -> 顯示真實姓名
        const showName = (e) => {
            e.preventDefault(); // 阻擋手機預設的長按選單
            if (el.dataset.name) {
                el.innerText = el.dataset.name;
                el.classList.add('revealed');
            }
        };

        // 🔴 動作：手指放開 -> 變回隱藏狀態
        const hideName = (e) => {
            e.preventDefault();
            el.innerText = "🤫 按住查看";
            el.classList.remove('revealed');
        };

        // 📱 綁定手機觸控事件
        el.addEventListener('touchstart', showName, {passive: false});
        el.addEventListener('touchend', hideName);
        el.addEventListener('touchcancel', hideName);

        // 🖱️ 綁定電腦滑鼠事件 (讓你用電腦測試時也能按)
        el.addEventListener('mousedown', showName);
        el.addEventListener('mouseup', hideName);
        el.addEventListener('mouseleave', hideName); // 移開範圍也馬上隱藏
    });
}

// 確保網頁載入後，自動啟動這些感應器
document.addEventListener('DOMContentLoaded', setupSecretTargets);