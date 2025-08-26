const DEBUG = false;
const debug = DEBUG ? console.log : () => {};

debug('Main menu loaded');

let gameRooms = [];
let currentRoom = null;

function initializeSocket() {
    
    socket.on('connect', () => {
    });
    
    socket.on('error', (data) => {
        alert(data.message || 'Có lỗi xảy ra');
    });
    
    socket.on('roomCreated', (roomData) => {
        gameRooms.push(roomData);
        updateRoomList();
    });
    
    socket.on('roomJoined', (roomData) => {
        currentRoom = roomData;
        openWaitingRoom(roomData);
        updateAllAvatars(); // cập nhật ngay khi vừa vào
    });
    
    socket.on('playerJoined', (data) => {
        if (currentRoom && currentRoom.id === data.roomId) {
            currentRoom.players = data.players;
            updateWaitingRoom();
            updateAllAvatars();
        }
        updateRoomList();
    });
    
    socket.on('playerLeft', (data) => {
        if (currentRoom && currentRoom.id === data.roomId) {
            currentRoom.players = data.players;
            updateWaitingRoom();
            updateAllAvatars();
        }
        updateRoomList();
    });
    
    socket.on('playerReady', (data) => {
        if (currentRoom && currentRoom.id === data.roomId) {
            updatePlayerStatus(data.playerId, data.ready);
        }
    });
    
    socket.on('avatarUpdated', (data) => {
        if (currentRoom && currentRoom.id === data.roomId) {
            console.log(`Avatar updated for player ${data.playerId}: ${data.avatar}`);
            userAvatars.delete(data.playerId); // force refetch
            const target = currentRoom.players.find(p=>p.id===data.playerId || p.name===data.playerId);
            if(target){ target.avatar = data.avatar; }
            updateWaitingRoom();
            updateAllAvatars();
        }
    });
    
    socket.on('gameStart', (data) => {
        try {
            // Lưu chế độ trận (AI hoặc PvP) để trang gamePlay phân biệt
            sessionStorage.setItem('matchMode', data.isAIGame ? 'ai' : 'pvp');
            if (data.isAIGame && currentRoom && currentRoom.aiDifficulty) {
                sessionStorage.setItem('botDifficulty', currentRoom.aiDifficulty);
            }
            
            // Chuyển đến trang phù hợp theo chế độ
            if (data.isAIGame) {
                window.location.href = 'gameAI.html';
            } else {
                window.location.href = 'gamePvP.html';
            }
        } catch(e) { 
            console.error('Error in gameStart:', e);
            // Fallback - try to determine mode from sessionStorage
            const mode = sessionStorage.getItem('matchMode');
            if (mode === 'ai') {
                window.location.href = 'gameAI.html';
            } else if (mode === 'pvp') {
                window.location.href = 'gamePvP.html';
            } else {
                // Default fallback to PvP if mode unknown
                window.location.href = 'gamePvP.html';
            }
        }
    });
    
    socket.on('roomList', (rooms) => {
        gameRooms = rooms;
        updateRoomList();
    });
}

window.onload = function() {
    const user = sessionStorage.getItem('user');
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    
    const userData = JSON.parse(user);
    const usernameElement = document.getElementById('username-display');
    if (usernameElement) {
        usernameElement.textContent = userData.username;
    }
    
    initializeSocket();
    
    // Set test avatars for specific users
    setTestAvatars();
    
    // Emit userLogin event to register the user as online
    setTimeout(() => {
        socket.emit('userLogin', userData.username);
    }, 100); // Small delay to ensure socket is connected
    
    const logoMenu = document.getElementById('logo-menu');
    if (logoMenu) {
        logoMenu.classList.add('transition-animation');        
        setTimeout(() => {
            const menuButtons = document.querySelectorAll('.menu-button');
            menuButtons.forEach(button => {
                button.classList.add('animate');
            });
        }, 2000);
    }
};

function logout() {
    sessionStorage.removeItem('user');
    window.location.href = 'index.html';
}

function openRoomPanel() {
    const roomPanel = document.getElementById('room-creation-panel');
    if (roomPanel) {
        roomPanel.classList.remove('hidden');
    }
}

function closeRoomPanel() {
    const roomPanel = document.getElementById('room-creation-panel');
    if (roomPanel) {
        roomPanel.classList.add('hidden');
    }
}

function openRoomBrowser() {
    const browserPanel = document.getElementById('room-browser-panel');
    if (browserPanel) {
        browserPanel.classList.remove('hidden');
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        const usernameElement = document.getElementById('browser-username');
        if (usernameElement && user.username) {
            usernameElement.textContent = user.username;
        }
        
        refreshRoomList();
    }
}

function closeRoomBrowser() {
    const browserPanel = document.getElementById('room-browser-panel');
    if (browserPanel) {
        browserPanel.classList.add('hidden');
    }
}

function refreshRoomList() {
    if (socket) {
        socket.emit('getRoomList');
    }
}

function updateRoomList() {
    const table = document.querySelector('.room-list-table');
    if (!table) return;
    
    // Clear existing content
    table.innerHTML = '';
    
    // Create header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Loại trận</th>
            <th>Chủ phòng</th>
            <th>Ghi chú</th>
            <th>Trạng thái</th>
            <th>Người chơi</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement('tbody');
    tbody.id = 'room-list-body';
    
    gameRooms.forEach(room => {
        const row = document.createElement('tr');
        row.className = 'room-row';
        row.setAttribute('data-room-id', room.id);
        
        const statusText = room.status; // Remove icon, just show text
        const playerCount = `${room.players.length}/${room.maxPlayers}`;
        
        row.innerHTML = `
            <td>${room.type}</td>
            <td>${room.host}</td>
            <td>${room.note}</td>
            <td>${statusText}</td>
            <td>${playerCount}</td>
        `;
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    
}

function joinSelectedRoom() {
    const selectedRow = document.querySelector('.room-row.selected');
    if (!selectedRow) {
        alert('Vui lòng chọn một phòng để vào!');
        return;
    }
    
    const roomId = selectedRow.getAttribute('data-room-id');
    const room = gameRooms.find(r => r.id === roomId);
    
    if (!room) {
        alert('Phòng không tồn tại!');
        return;
    }
    
    // Check if room is full
    if (room.players.length >= room.maxPlayers) {
        alert('Phòng đã đầy!');
        return;
    }
    
    let enteredPassword = '';
    
    // Check if room requires password
    if (room.status === 'Khóa') {
        enteredPassword = prompt('Nhập mật khẩu phòng:');
        if (enteredPassword === null) {
            // User cancelled the prompt
            return;
        }
    }
    
    // Join room via socket - let server validate password
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (socket) {
        socket.emit('joinRoom', {
            roomId: roomId,
            player: {
                id: user.username,
                name: user.username,
                ready: false,
                avatar: currentUserAvatar // Include current user's avatar
            },
            password: enteredPassword
        });
    }
}

function createRoom() {
    debug('Creating room...');
    
    const type = document.querySelector('.type-select').value;
    const duelNote = document.querySelector('.duel-note-input').value.trim();
    const duelPassword = document.querySelector('.duel-password-input').value.trim();
    const aiDifficulty = document.querySelector('.ai-difficulty-select').value;
    
    // Get selected duel types (only for multiplayer)
    const selectedTypes = [];
    if (type === 'match') {
        const typeCheckboxes = document.querySelectorAll('input[name="duel-type"]:checked');
        typeCheckboxes.forEach(checkbox => {
            selectedTypes.push(checkbox.value);
        });
        
        // If no types selected, default to "Công khai"
        if (selectedTypes.length === 0) {
            selectedTypes.push('Công khai');
            debug('No types selected, defaulting to Công khai');
        }
    }
    
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const roomId = 'room_' + Date.now();
    
    const savedAvatar = sessionStorage.getItem('userAvatar');
    const roomData = {
        id: roomId,
        type: type === 'single' ? 'Đánh với máy' : 'Đánh với người',
        host: user.username || 'Unknown',
        note: duelNote || (type === 'single' ? `Đánh với AI (${getAIDifficultyName(aiDifficulty)})` : 'Không có ghi chú'),
        password: type === 'match' ? duelPassword : '', // Only multiplayer rooms have passwords
        status: type === 'single' ? 'AI' : (selectedTypes[0] || 'Công khai'), // AI rooms don't use password status
        maxPlayers: type === 'single' ? 1 : 2, // AI room only needs 1 player
        players: [{
            id: user.username,
            name: user.username,
            ready: false,
            avatar: savedAvatar || currentUserAvatar
        }],
        created: new Date(),
        aiDifficulty: type === 'single' ? aiDifficulty : null // Store AI difficulty for single player
    };
    
    debug('Creating room with data:', roomData);
    debug('Password field:', duelPassword);
    debug('Status:', selectedTypes[0] || 'AI');
    debug('Room type:', type);
    debug('AI Difficulty:', aiDifficulty);
    
    // Create room via socket
    if (socket) {
        if (type === 'single') {
            // Create AI room
            socket.emit('createAIRoom', roomData);
            debug('AI Room creation request sent');
        } else {
            // Create normal multiplayer room
            socket.emit('createRoom', roomData);
            debug('Normal room creation request sent');
        }
    }
    
    // Close creation panel smoothly
    setTimeout(() => {
        closeRoomPanel();
        
        // Clear form after panel is closed
        setTimeout(() => {
            const noteInput = document.querySelector('.duel-note-input');
            const passwordInput = document.querySelector('.duel-password-input');
            if (noteInput) noteInput.value = '';
            if (passwordInput) passwordInput.value = '';
            
            // Reset radio buttons to default (Công khai)
            const radioButtons = document.querySelectorAll('input[name="duel-type"]');
            radioButtons.forEach(radio => {
                // Temporarily enable to change programmatically
                radio.disabled = false;
                radio.checked = (radio.value === 'Công khai');
                // Re-disable to prevent manual interaction
                radio.disabled = true;
            });
            
            // Reset AI difficulty to medium
            const aiDifficultySelect = document.querySelector('.ai-difficulty-select');
            if (aiDifficultySelect) {
                aiDifficultySelect.value = 'medium';
            }
        }, 100);
    }, 50);
}

// Helper function to get AI difficulty display name
function getAIDifficultyName(difficulty) {
    const difficultyNames = {
        'easy': 'Dễ',
        'medium': 'Trung bình', 
        'hard': 'Khó',
        'expert': 'Chuyên gia'
    };
    return difficultyNames[difficulty] || 'Trung bình';
}

// Waiting Room functions
function openWaitingRoom(roomData) {
    currentRoom = roomData;
    
    const waitingPanel = document.getElementById('waiting-room-panel');
    if (waitingPanel) {
        waitingPanel.classList.remove('hidden');
        
        // Update room info
        document.getElementById('room-name-display').textContent = roomData.note || 'Phòng chờ';
        document.getElementById('room-host-display').textContent = roomData.host;
        document.getElementById('room-type-display').textContent = roomData.type;
        
        updateWaitingRoom();
    }
}

function closeWaitingRoom() {
    const waitingPanel = document.getElementById('waiting-room-panel');
    if (waitingPanel) {
        waitingPanel.classList.add('hidden');
        
        // Leave room via socket
        if (socket && currentRoom) {
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');
            socket.emit('leaveRoom', {
                roomId: currentRoom.id,
                playerId: user.username
            });
        }
        
        currentRoom = null;
    }
}

// Function to generate avatar for user
async function generateAvatar(username) {
    // Use current user's selected avatar if it's the current user
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (username === user.username && currentUserAvatar) {
        return currentUserAvatar;
    }
    
    // Fetch avatar for other users
    return await fetchUserAvatar(username);
}

// Function to set player avatar
async function setPlayerAvatar(playerIndex, username, avatar = null) {
    console.log(`Setting avatar for player ${playerIndex}, username: ${username}, avatar: ${avatar}`);
    
    const avatarImg = document.getElementById(`player${playerIndex}-avatar-img`);
    const placeholder = document.getElementById(`player${playerIndex}-placeholder`);
    
    if (!avatarImg || !placeholder) {
        console.error(`Avatar elements not found for player ${playerIndex}`);
        return;
    }
    
    if (username && username !== 'Đang chờ...') {
        console.log(`Loading avatar for user: ${username}`);
        
        // Use provided avatar first, then fall back to generation
        let avatarUrl = avatar;
        if (!avatarUrl) {
            avatarUrl = await generateAvatar(username);
        }
        // Cache buster để bắt trình duyệt tải lại khi người chơi đổi avatar
        const cacheBusted = avatarUrl + (avatarUrl.includes('?') ? '&' : '?') + 'v=' + Date.now();
        
        console.log(`Avatar URL for ${username}: ${avatarUrl}`);
        
    avatarImg.src = cacheBusted;
        avatarImg.style.display = 'block';
        placeholder.style.display = 'none';
        
        // Fallback to placeholder if image fails to load
    avatarImg.onerror = function() {
            console.error(`Failed to load avatar image: ${avatarUrl}`);
            avatarImg.style.display = 'none';
            placeholder.style.display = 'block';
            placeholder.textContent = username.substring(0, 2).toUpperCase();
        };
        
        avatarImg.onload = function() {
            console.log(`Avatar loaded successfully for ${username}: ${avatarUrl}`);
        };
    } else {
        console.log(`No username provided for player ${playerIndex}, showing placeholder`);
        avatarImg.style.display = 'none';
        placeholder.style.display = 'block';
        placeholder.textContent = `P${playerIndex}`;
    }
}

function updateAllAvatars(){
    if(!currentRoom || !currentRoom.players) return;
    currentRoom.players.forEach((p,i)=>{
        // Ưu tiên dữ liệu avatar có sẵn, fallback fetch
        setPlayerAvatar(i+1, p.name, p.avatar);
    });
}

function updateWaitingRoom() {
    if (!currentRoom) return;
    const players = currentRoom.players || [];
    console.log('Updating waiting room with players:', players);
    
    // Update player count display
    const playerCountDisplay = document.getElementById('player-count-display');
    if (playerCountDisplay) {
        playerCountDisplay.textContent = `Người chơi (${players.length}/${currentRoom.maxPlayers || 2})`;
    }
    
    // Clear avatar cache to force reload of avatars
    userAvatars.clear();
    
    // Update player slots
    for (let i = 0; i < 2; i++) {
        const player = players[i];
        const nameElement = document.getElementById(`player${i + 1}-name`);
        const statusElement = document.getElementById(`player${i + 1}-status`);
        
        if (player) {
            console.log(`Setting up player ${i + 1}:`, player);
            nameElement.textContent = player.name;
            
            // Special handling for AI bot
            if (player.id === "ai-bot") {
                statusElement.textContent = 'AI Sẵn sàng';
                statusElement.className = 'player-status ai-ready';
            } else {
                statusElement.textContent = player.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng';
                statusElement.className = player.ready ? 'player-status ready' : 'player-status';
            }
            
            // Set player avatar
            setPlayerAvatar(i + 1, player.name, player.avatar);
        } else {
            console.log(`No player for slot ${i + 1}`);
            nameElement.textContent = 'Đang chờ...';
            statusElement.textContent = 'Chưa sẵn sàng';
            statusElement.className = 'player-status';
            
            // Reset avatar to placeholder
            setPlayerAvatar(i + 1, null);
        }
    }
    
    // Update ready button
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const currentPlayer = players.find(p => p.id === user.username);
    const readyBtn = document.getElementById('ready-btn');
    
    if (readyBtn && currentPlayer) {
        readyBtn.textContent = currentPlayer.ready ? 'Hủy sẵn sàng' : 'Sẵn sàng';
        readyBtn.className = currentPlayer.ready ? 'ready-btn not-ready' : 'ready-btn';
    }
    
    // Check if both players are ready
    if (players.length === 2 && players.every(p => p.ready)) {
        setTimeout(() => {
            if (socket && currentRoom) {
                socket.emit('startGame', { roomId: currentRoom.id });
            }
        }, 1000);
    }
}

function updatePlayerStatus(playerId, ready) {
    if (!currentRoom) return;
    
    const player = currentRoom.players.find(p => p.id === playerId);
    if (player) {
        player.ready = ready;
        updateWaitingRoom();
    }
}

function toggleReady() {
    if (!socket || !currentRoom) return;
    
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const currentPlayer = currentRoom.players.find(p => p.id === user.username);
    
    if (currentPlayer) {
        const newReadyState = !currentPlayer.ready;
        socket.emit('playerReady', {
            roomId: currentRoom.id,
            playerId: user.username,
            ready: newReadyState
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const roomBtn = document.querySelector('.room-btn');
    const deckBtn = document.querySelector('.deck-btn');
    const myProfileBtn = document.querySelector('.my-profile-btn');
    const exitBtn = document.querySelector('.exit-btn');
    const settingsBtn = document.querySelector('.settings-btn');
    const closeRoomBtn = document.querySelector('.close-room-panel');
    const hostDuelBtn = document.querySelector('.host-duel-btn');
    const roomPanelOverlay = document.querySelector('.room-panel-overlay');
    const closeWaitingRoomBtn = document.querySelector('.close-waiting-room');
    const leaveRoomBtn = document.querySelector('.leave-room-btn');
    const readyBtn = document.getElementById('ready-btn');
    const waitingRoomOverlay = document.querySelector('.waiting-room-overlay');
        if (deckBtn) {
            deckBtn.onclick = function() {
                window.location.href = 'deckbuilder.html';
            };
    }

    const refreshRoomsBtn = document.querySelector('.refresh-rooms-btn');
    const joinRoomBtn = document.querySelector('.join-room-btn');
    const cancelBrowserBtn = document.querySelector('.cancel-browser-btn');
    const roomBrowserOverlay = document.querySelector('.room-browser-overlay');
    const hostRoomBtn = document.querySelector('.host-room-btn');
    const typeSelect = document.querySelector('.type-select');
    
    // Handle room type change
    if (typeSelect) {
        typeSelect.addEventListener('change', function() {
            const isSinglePlayer = this.value === 'single';
            
            // Show/hide AI difficulty options
            const aiDifficultyGroup = document.querySelector('.ai-difficulty-group');
            if (aiDifficultyGroup) {
                aiDifficultyGroup.style.display = isSinglePlayer ? 'block' : 'none';
            }
            
            // Show/hide multiplayer-only options
            const multiplayerElements = document.querySelectorAll('.multiplayer-only');
            multiplayerElements.forEach(element => {
                element.style.display = isSinglePlayer ? 'none' : 'block';
            });
            
            // Clear password when switching to single player
            if (isSinglePlayer) {
                const passwordInput = document.querySelector('.duel-password-input');
                if (passwordInput) {
                    passwordInput.value = '';
                }
            }
            
            console.log(`Room type changed to: ${this.value}, Single player: ${isSinglePlayer}`);
        });
        
        // Trigger initial setup
        typeSelect.dispatchEvent(new Event('change'));
    }
    
    if (roomBtn) {
        roomBtn.onclick = async function() {
            openRoomBrowser();
            if (window.BGM) { await BGM.init(); if(!BGM.isPlaying){ BGM.play(0); } }
        };
    }
    
    if (deckBtn) {
        deckBtn.onclick = async function() {
            if (window.BGM && !BGM.isPlaying) { await BGM.init(); BGM.play(0); }
            window.location.href = 'deckbuilder.html';
        };
    }
    
    if (myProfileBtn) {
        myProfileBtn.onclick = function() {
            openProfile(); // Open current user's profile
        };
    }
    
    if (exitBtn) {
        exitBtn.onclick = function() {
            logout();
        };
    }
    
    if (settingsBtn) {
        settingsBtn.onclick = async function() {
            if (window.BGM && !BGM.isPlaying) { await BGM.init(); BGM.play(0); }
            if (window.__openSettingsOverlay) { window.__openSettingsOverlay(); }
            else { window.location.href = 'settings.html'; }
        };
    }

    // BGM control buttons (prev / play-pause / next)
    const bgmPrev = document.getElementById('bgm-prev');
    const bgmNext = document.getElementById('bgm-next');
    const bgmToggle = document.getElementById('bgm-toggle');
    const bgmMute = document.getElementById('bgm-mute');
    const bgmVolume = document.getElementById('bgm-volume');
    let lastNonZeroVolume = 0.6; // remember for unmute restore
    function updateBgmToggleLabel(){
        if (!bgmToggle) return;
        bgmToggle.textContent = (window.BGM && BGM.isPlaying) ? 'PAUSE' : 'PLAY';
    }
    function readStoredMute(){
        try { const s = JSON.parse(localStorage.getItem('gameSettings'))||{}; return typeof s.bgmMuted==='boolean'? s.bgmMuted : !!s.mute; } catch { return false; }
    }
    function readStoredVolume(){
        try { const s = JSON.parse(localStorage.getItem('gameSettings'))||{}; return typeof s.bgmVolume==='number'? s.bgmVolume : 0.6; } catch { return 0.6; }
    }
    function updateMuteButtonLabel(){
        if(!bgmMute) return;
    const m = (window.BGM && typeof BGM.isMuted!== 'undefined') ? BGM.isMuted : readStoredMute();
        bgmMute.textContent = m ? '🔇' : '🔊';
        bgmMute.style.opacity = m ? '0.7' : '1';
        if (bgmVolume && !m){
            const v = readStoredVolume();
            bgmVolume.value = Math.round(v*100);
        }
    }
    function initVolumeUI(){
        if(!bgmVolume) return;
        const vol = readStoredVolume();
        lastNonZeroVolume = vol>0?vol:lastNonZeroVolume;
        bgmVolume.value = Math.round(vol*100);
    }
    if (bgmPrev) bgmPrev.onclick = async () => { if (window.BGM){ await BGM.init(); if(!BGM.isPlaying){ BGM.play(0);} else { BGM.prev(); } updateBgmToggleLabel(); } };
    if (bgmNext) bgmNext.onclick = async () => { if (window.BGM){ await BGM.init(); if(!BGM.isPlaying){ BGM.play(0);} else { BGM.next(); } updateBgmToggleLabel(); } };
    if (bgmToggle) bgmToggle.onclick = async () => {
        if(!window.BGM) return;
        await BGM.init();
        if (BGM.isPlaying){ BGM.pause(); } else { BGM.play(BGM.currentIndex||0); }
        setTimeout(updateBgmToggleLabel, 50);
    };
    if (bgmMute) bgmMute.onclick = async () => {
        if(!window.BGM) return;
        await BGM.init();
    if (!BGM.isMuted){
            // Muting – remember last non-zero volume
            const curVol = readStoredVolume();
            if (curVol>0.001) lastNonZeroVolume = curVol;
            BGM.setMute(true);
            if (bgmVolume) bgmVolume.value = 0;
        } else {
            // Unmuting – restore previous volume
            const restore = lastNonZeroVolume>0.001?lastNonZeroVolume:0.6;
            BGM.setMute(false);
            BGM.setVolume(restore);
            if (bgmVolume) bgmVolume.value = Math.round(restore*100);
        }
        setTimeout(updateMuteButtonLabel, 50);
    };
    if (bgmVolume){
        bgmVolume.addEventListener('input', async (e)=>{
            if(!window.BGM) return; await BGM.init();
            const val = parseInt(e.target.value,10)/100; // 0..1
            if (val <= 0){
                BGM.setVolume(0); // store 0
                BGM.setMute(true);
            } else {
                lastNonZeroVolume = val; // track
                if (BGM.isMuted) BGM.setMute(false);
                BGM.setVolume(val);
            }
            updateMuteButtonLabel();
        });
    }
    updateBgmToggleLabel();
    updateMuteButtonLabel();
    initVolumeUI();

    // ===== BGM Info UI =====
    const trackNameEl = document.getElementById('bgm-track-name');
    const progressBar = document.getElementById('bgm-progress');
    const seekBar = document.getElementById('bgm-seekbar');
    const timeCurEl = document.getElementById('bgm-time');
    const timeDurEl = document.getElementById('bgm-duration');
    function fmt(t){ if(!t||isNaN(t)) return '0:00'; const m=Math.floor(t/60); const s=Math.floor(t%60).toString().padStart(2,'0'); return `${m}:${s}`; }
    function updateProgress(){
        if(!window.BGM) return;
        const pos = BGM.getPosition();
        const dur = BGM.getDuration();
        if (dur>0){
            progressBar.style.width = `${(pos/dur)*100}%`;
            timeCurEl.textContent = fmt(pos);
            timeDurEl.textContent = fmt(dur);
        }
    }
    window.addEventListener('bgm:trackchange', e=>{
        const idx = e.detail.index;
        const name = e.detail.url.split('/').pop();
        if (trackNameEl) trackNameEl.textContent = 'Track: ' + name;
        setTimeout(updateProgress, 100);
    });
    window.addEventListener('settings:changed', ()=>{ updateMuteButtonLabel(); initVolumeUI(); });
    if (seekBar) {
        seekBar.addEventListener('click', (e)=>{
            if(!window.BGM || !BGM.getDuration()) return;
            const rect = seekBar.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left)/rect.width));
            const target = ratio * BGM.getDuration();
            BGM.seek(target);
        });
    }
    setInterval(()=>{ if(!document.hidden) updateProgress(); }, 500);
    
    if (closeRoomBtn) {
        closeRoomBtn.onclick = closeRoomPanel;
    }
    
    if (hostDuelBtn) {
        hostDuelBtn.onclick = function(e) {
            e.preventDefault();
            
            if (hostDuelBtn.disabled) return;
            
            hostDuelBtn.disabled = true;
            hostDuelBtn.textContent = 'Đang tạo...';
            
            setTimeout(() => {
                createRoom();
                setTimeout(() => {
                    hostDuelBtn.disabled = false;
                    hostDuelBtn.textContent = 'Tạo phòng';
                }, 500);
            }, 50);
        };
    }
    
    if (roomPanelOverlay) {
        roomPanelOverlay.onclick = closeRoomPanel;
    }
    
    if (closeWaitingRoomBtn) {
        closeWaitingRoomBtn.onclick = closeWaitingRoom;
    }
    
    if (leaveRoomBtn) {
        leaveRoomBtn.onclick = closeWaitingRoom;
    }
    
    if (readyBtn) {
        readyBtn.onclick = toggleReady;
    }
    
    if (waitingRoomOverlay) {
        waitingRoomOverlay.onclick = closeWaitingRoom;
    }
    
    if (refreshRoomsBtn) {
        refreshRoomsBtn.onclick = refreshRoomList;
    }
    
    if (joinRoomBtn) {
        joinRoomBtn.onclick = joinSelectedRoom;
    }
    
    if (cancelBrowserBtn) {
        cancelBrowserBtn.onclick = closeRoomBrowser;
    }
    
    if (roomBrowserOverlay) {
        roomBrowserOverlay.onclick = closeRoomBrowser;
    }
    
    if (hostRoomBtn) {
        hostRoomBtn.onclick = function() {
            openRoomPanel();
        };
    }
    
    document.addEventListener('click', function(e) {
        if (e.target.closest('.room-row')) {
            document.querySelectorAll('.room-row').forEach(row => {
                row.classList.remove('selected');
            });
            
            e.target.closest('.room-row').classList.add('selected');

            if (joinRoomBtn) {
                joinRoomBtn.disabled = false;
            }
        }
    });
    
    const searchInput = document.querySelector('.room-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const rows = document.querySelectorAll('.room-row');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }
    
    const roomInputs = document.querySelectorAll('.duel-note-input, .duel-password-input');
    roomInputs.forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                createRoom();
            }
        });
    });
    
    const passwordInput = document.querySelector('.duel-password-input');
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            const hasPassword = this.value.trim().length > 0;
            const radioButtons = document.querySelectorAll('input[name="duel-type"]');
            
            radioButtons.forEach(radio => {
                radio.disabled = false;
                
                if (hasPassword) {
                    radio.checked = (radio.value === 'Khóa');
                } else {
                    radio.checked = (radio.value === 'Công khai');
                }

                radio.disabled = true;
            });
            
            debug('Password input changed, auto-selected:', hasPassword ? 'Khóa' : 'Công khai');
        });

        passwordInput.addEventListener('paste', function() {
            setTimeout(() => {
                const hasPassword = this.value.trim().length > 0;
                const radioButtons = document.querySelectorAll('input[name="duel-type"]');
                
                radioButtons.forEach(radio => {
                    radio.disabled = false;
                    
                    if (hasPassword) {
                        radio.checked = (radio.value === 'Khóa');
                    } else {
                        radio.checked = (radio.value === 'Công khai');
                    }

                    radio.disabled = true;
                });
                
                debug('Password pasted, auto-selected:', hasPassword ? 'Khóa' : 'Công khai');
            }, 10);
        });
    }
});

// Profile viewer functions
function openProfile(username = null) {
    const profileViewer = document.getElementById('profile-viewer');
    if (profileViewer) {
        profileViewer.style.display = 'flex';
        
        // Add click-outside-to-close functionality
        profileViewer.onclick = function(e) {
            // Only close if clicking on the profile-viewer background, not on the profile container
            if (e.target === profileViewer) {
                closeProfile();
            }
        };
        
        // Add avatar click handler when profile opens
        setTimeout(() => {
            const profileAvatar = document.getElementById('profile-avatar-img');
            const avatarContainer = document.querySelector('.avatar-container');
            
            if (profileAvatar) {
                profileAvatar.onclick = openAvatarSelector;
                console.log('Profile avatar click handler added in openProfile'); // Debug log
            }
            
            // Backup: Add click to container as well
            if (avatarContainer) {
                avatarContainer.onclick = openAvatarSelector;
                avatarContainer.style.cursor = 'pointer';
                console.log('Avatar container click handler added'); // Debug log
            }
        }, 100); // Small delay to ensure DOM is ready
        
        if (username) {
            loadUserProfile(username);
        } else {
            // Load current user's profile
            const user = JSON.parse(sessionStorage.getItem('user') || '{}');
            if (user.username) {
                loadUserProfile(user.username);
            }
        }
    }
}

function closeProfile() {
    const profileViewer = document.getElementById('profile-viewer');
    if (profileViewer) {
        // Remove the click event listener
        profileViewer.onclick = null;
        profileViewer.style.display = 'none';
    }
}

// Debounce function để tránh spam API
let searchTimeout;

async function searchUserProfile() {
    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    // Debounce 500ms
    searchTimeout = setTimeout(async () => {
        const searchInput = document.getElementById('profile-search-input');
        const username = searchInput.value.trim();
        
        if (!username) {
            alert('Vui lòng nhập tên người dùng!');
            return;
        }

        try {
            const response = await fetch('/api/user-profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username })
            });

            const data = await response.json();

        if (data.success) {
            loadUserProfile(username, data.user);
        } else {
            alert(data.message || 'Không tìm thấy người dùng!');
        }
    } catch (error) {
        console.error('Search profile error:', error);
        alert('Lỗi khi tìm kiếm người dùng!');
    }
    }, 500); // Debounce delay
}

function loadUserProfile(username, userData = null) {
    // Update username display
    const usernameDisplay = document.getElementById('profile-username-text');
    if (usernameDisplay) {
        usernameDisplay.textContent = username;
    }

    if (userData) {
        // Update status
        const statusElement = document.getElementById('profile-status');
        if (statusElement) {
            statusElement.textContent = userData.isOnline ? 'Online' : 'Offline';
            statusElement.style.color = userData.isOnline ? '#00ff88' : '#ff6b6b';
        }

        // Update last seen
        const lastSeenElement = document.getElementById('profile-last-seen');
        if (lastSeenElement) {
            lastSeenElement.textContent = userData.isOnline ? 'Now' : formatDate(userData.lastSeen);
        }

        // Update registration date
        const registeredElement = document.getElementById('profile-registered');
        if (registeredElement) {
            registeredElement.textContent = formatDate(userData.registeredAt);
        }

        // Update stats
        updateProfileStats(userData.stats || {});
    } else {
        // Default values for current user
        updateDefaultProfileInfo();
    }

    // Clear search input
    const searchInput = document.getElementById('profile-search-input');
    if (searchInput) {
        searchInput.value = '';
    }
}

function updateProfileStats(stats) {
    // AI stats
    const aiWins = document.getElementById('ai-wins');
    const aiLosses = document.getElementById('ai-losses');
    const aiDraws = document.getElementById('ai-draws');

    if (aiWins) aiWins.textContent = stats.aiWins || '0';
    if (aiLosses) aiLosses.textContent = stats.aiLosses || '0';
    if (aiDraws) aiDraws.textContent = stats.aiDraws || '0';

    // Online stats
    const onlineWins = document.getElementById('online-wins');
    const onlineLosses = document.getElementById('online-losses');
    const onlineDraws = document.getElementById('online-draws');

    if (onlineWins) onlineWins.textContent = stats.onlineWins || '0';
    if (onlineLosses) onlineLosses.textContent = stats.onlineLosses || '0';
    if (onlineDraws) onlineDraws.textContent = stats.onlineDraws || '0';
}

function updateDefaultProfileInfo() {
    // Set default online status for current user
    const statusElement = document.getElementById('profile-status');
    if (statusElement) {
        statusElement.textContent = 'Online';
        statusElement.style.color = '#00ff88';
    }

    const lastSeenElement = document.getElementById('profile-last-seen');
    if (lastSeenElement) {
        lastSeenElement.textContent = 'Now';
    }

    // Try to get registration date from session or use placeholder
    const registeredElement = document.getElementById('profile-registered');
    if (registeredElement) {
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (user.registeredAt) {
            registeredElement.textContent = formatDate(user.registeredAt);
        } else {
            registeredElement.textContent = 'Unknown';
        }
    }

    // Use default stats
    updateProfileStats({});
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch (error) {
        return 'Unknown';
    }
}

// Setup profile viewer event handlers
document.addEventListener('DOMContentLoaded', function() {
    const closeProfileBtn = document.getElementById('close-profile');
    const searchProfileBtn = document.getElementById('search-profile-btn');
    const profileSearchInput = document.getElementById('profile-search-input');

    if (closeProfileBtn) {
        closeProfileBtn.onclick = closeProfile;
    }

    if (searchProfileBtn) {
        searchProfileBtn.onclick = searchUserProfile;
    }

    if (profileSearchInput) {
        profileSearchInput.onkeypress = function(e) {
            if (e.key === 'Enter') {
                searchUserProfile();
            }
        };
    }
});

// Avatar Selector Functions
let currentUserAvatar = './assets/reimu2.png'; // Default avatar
let userAvatars = new Map(); // Cache for other users' avatars

// Load avatar sớm trước khi người dùng tạo phòng
(function earlyLoadAvatar(){
  try {
    const saved = sessionStorage.getItem('userAvatar');
    if (saved) { currentUserAvatar = saved; return; }
    const userStr = sessionStorage.getItem('user');
    if (!userStr) return;
    const { username } = JSON.parse(userStr);
    if (!username) return;
    fetch('/api/profile/' + encodeURIComponent(username))
      .then(r=>r.json())
      .then(d=>{
        if(d && d.success && d.profile && d.profile.avatar){
          currentUserAvatar = d.profile.avatar;
          sessionStorage.setItem('userAvatar', d.profile.avatar);
        }
      }).catch(()=>{});
  } catch(e) { /* ignore */ }
})();

async function fetchUserAvatar(username) {
    // Check cache first
    if (userAvatars.has(username)) {
        console.log(`Avatar cache hit for ${username}:`, userAvatars.get(username));
        return userAvatars.get(username);
    }
    
    // Check if we're in a room and the user has an avatar in room data
    if (currentRoom) {
        const player = currentRoom.players.find(p => p.id === username);
        if (player && player.avatar) {
            console.log(`Found avatar in room data for ${username}:`, player.avatar);
            userAvatars.set(username, player.avatar);
            return player.avatar;
        }
    }
    
    try {
        console.log(`Fetching avatar for user: ${username}`);
        const response = await fetch(`/api/profile/${username}`);
        const data = await response.json();
        
        console.log(`API response for ${username}:`, data);
        
        if (data.success && data.profile.avatar) {
            userAvatars.set(username, data.profile.avatar);
            console.log(`Avatar set for ${username}:`, data.profile.avatar);
            return data.profile.avatar;
        }
    } catch (error) {
        console.error('Error fetching user avatar:', error);
    }
    
    // Fallback to default
    const defaultAvatar = './assets/reimu2.png';
    userAvatars.set(username, defaultAvatar);
    console.log(`Using default avatar for ${username}:`, defaultAvatar);
    return defaultAvatar;
}

function openAvatarSelector() {
    console.log('openAvatarSelector called'); // Debug log
    const avatarSelector = document.getElementById('avatar-selector');
    console.log('Avatar selector element:', avatarSelector); // Debug log
    
    if (avatarSelector) {
        avatarSelector.style.display = 'flex';
        console.log('Avatar selector displayed'); // Debug log
        
        // Mark current avatar as selected
        const avatarOptions = document.querySelectorAll('.avatar-option');
        avatarOptions.forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.avatar === currentUserAvatar) {
                option.classList.add('selected');
            }
        });
    } else {
        console.log('Avatar selector element not found!'); // Debug log
    }
}

function closeAvatarSelector() {
    const avatarSelector = document.getElementById('avatar-selector');
    if (avatarSelector) {
        avatarSelector.style.display = 'none';
    }
}

async function selectAvatar(avatarPath) {
    currentUserAvatar = avatarPath;
    
    // Update profile avatar
    const profileAvatar = document.getElementById('profile-avatar-img');
    if (profileAvatar) {
        profileAvatar.src = avatarPath;
    }
    
    // Save avatar to server
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (user.username) {
        try {
            await fetch('/api/update-avatar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    username: user.username, 
                    avatar: avatarPath 
                })
            });
            
            // Update cache
            userAvatars.set(user.username, avatarPath);
            console.log('Avatar saved to server:', avatarPath);
            
            // Broadcast avatar update to other players in the room
            if (currentRoom && socket) {
                socket.emit('avatarUpdate', {
                    roomId: currentRoom.id,
                    playerId: user.username,
                    avatar: avatarPath
                });
                console.log('Avatar update broadcasted to room:', currentRoom.id);
            }
        } catch (error) {
            console.error('Error saving avatar:', error);
        }
    }
    
    // Update current user's avatar in waiting room if they're in a room
    if (currentRoom && user.username) {
        const player = currentRoom.players.find(p => p.id === user.username);
        if (player) {
            const playerIndex = currentRoom.players.indexOf(player) + 1;
            await setPlayerAvatar(playerIndex, user.username);
        }
    }
    
    // Store avatar preference in sessionStorage
    sessionStorage.setItem('userAvatar', avatarPath);
    
    closeAvatarSelector();
}

// Function to set test avatars
async function setTestAvatars() {
    try {
        const response = await fetch('/api/set-test-avatars', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        if (data.success) {
            console.log('Test avatars set successfully:', data.message);
            // Clear avatar cache to force reload
            userAvatars.clear();
        } else {
            console.error('Failed to set test avatars:', data.message);
        }
    } catch (error) {
        console.error('Error setting test avatars:', error);
    }
}

// Initialize avatar selector event handlers
document.addEventListener('DOMContentLoaded', function() {
    // Load saved avatar preference
    const savedAvatar = sessionStorage.getItem('userAvatar');
    if (savedAvatar) {
        currentUserAvatar = savedAvatar;
        const profileAvatar = document.getElementById('profile-avatar-img');
        if (profileAvatar) {
            profileAvatar.src = savedAvatar;
        }
    }
    
    // Profile avatar click handler
    const profileAvatar = document.getElementById('profile-avatar-img');
    if (profileAvatar) {
        profileAvatar.onclick = openAvatarSelector;
        console.log('Profile avatar click handler added'); // Debug log
    }
    
    // Close avatar selector on background click
    const avatarSelectorBackground = document.querySelector('.avatar-selector-background');
    if (avatarSelectorBackground) {
        avatarSelectorBackground.onclick = closeAvatarSelector;
    }
    
    // Prevent closing when clicking inside the container
    const avatarSelectorContainer = document.querySelector('.avatar-selector-container');
    if (avatarSelectorContainer) {
        avatarSelectorContainer.onclick = function(e) {
            e.stopPropagation(); // Ngăn event bubble lên background
        };
    }
    
    // Also allow clicking on the modal itself to close
    const avatarSelector = document.getElementById('avatar-selector');
    if (avatarSelector) {
        avatarSelector.onclick = function(e) {
            if (e.target === avatarSelector) {
                closeAvatarSelector();
            }
        };
    }
    
    // Avatar option click handlers
    const avatarOptions = document.querySelectorAll('.avatar-option');
    avatarOptions.forEach(option => {
        option.onclick = function() {
            selectAvatar(this.dataset.avatar);
        };
    });
});
