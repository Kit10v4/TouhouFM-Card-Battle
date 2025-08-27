const express = require('express');
const app = express();
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server } = require("socket.io");
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 100, // Số request tối đa trong 15 phút
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);
const { AIBot, AIBotManager } = require('./bot.js');

// Game rules for card game
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules.json')));

// Development vs Production logging
const isDevelopment = process.env.NODE_ENV !== 'production';

function debugLog(...args) {
    if (isDevelopment) {
        console.log('[DEBUG]', ...args);
    }
}

function infoLog(...args) {
    console.log('[INFO]', ...args);
}

function errorLog(...args) {
    console.error('[ERROR]', ...args);
}

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.boxicons.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "ws:"],
            fontSrc: ["'self'", "https://cdn.boxicons.com"],
        },
    },
}));

// API rate limiting (more lenient for development)
const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // Allow 50 requests per 5 minutes
    message: {
        error: true,
        message: 'Quá nhiều yêu cầu, vui lòng thử lại sau 5 phút.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// SSL Configuration
const sslOptions = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

const server = https.createServer(sslOptions, app);
const io = new Server(server, {
    cors: {
        origin: ["https://localhost:4000"],
        methods: ["GET", "POST"]
    }
});


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'client')));
app.use('/assets', express.static(path.join(__dirname, 'client/assets')));

// Game rooms storage
const gameRooms = new Map();
const playerRooms = new Map(); // Track which room each player is in
const playerSockets = new Map(); // Track socket ID for each player

let emailConfig;
try {
    emailConfig = require('./email-config.js');
} catch (error) {
    console.warn('Email config file not found. Please create email-config.js from email-config.example.js');
    emailConfig = {
        service: 'gmail',
        auth: {
            user: 'nekohimeken@gmail.com',
            pass: 'rrme sewt tucm cfcu'
        },
        from: 'nekohimeken@gmail.com'
    };
}

const transporter = nodemailer.createTransport(emailConfig);

const verificationCodes = new Map();
const registeredUsers = new Map();

app.get('/healthcheck', (req, res) => {
  res.send('CBG App running...');
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/client/index.html');
});

app.get('/main_menu.html', (req, res) => {
    res.sendFile(__dirname + '/client/main_menu.html');
});

app.get('/gameAI.html', (req, res) => {
    res.sendFile(__dirname + '/client/gameAI.html');
});

app.get('/gamePvP.html', (req, res) => {
    res.sendFile(__dirname + '/client/gamePvP.html');
});

app.get('/deckbuilder.html', (req, res) => {
    res.sendFile(__dirname + '/client/deckbuilder.html');
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        if (!username || !password || !email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng điền đầy đủ thông tin' 
            });
        }

        // Password strength validation
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Mật khẩu phải có ít nhất 6 ký tự' 
            });
        }

        // Check if username already exists
        if (registeredUsers.has(username)) {
            return res.status(409).json({ 
                success: false, 
                message: 'Tên đăng nhập đã tồn tại' 
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email không hợp lệ' 
            });
        }

        // Hash password before storing
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        verificationCodes.set(email, {
            code: verificationCode,
            username,
            password: hashedPassword, // Store hashed password
            expires: Date.now() + 10 * 60 * 1000
        });

        const mailOptions = {
            from: emailConfig.from,
            to: email,
            subject: 'Xác thực tài khoản - Touhou FM: Battle Card',
            html: `
                <h2>Xác thực tài khoản</h2>
                <p>Chào ${username},</p>
                <p>Mã xác thực của bạn là: <strong style="font-size: 24px; color: #007bff;">${verificationCode}</strong></p>
                <p>Mã này sẽ hết hạn sau 10 phút.</p>
                <p>Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email này.</p>
                <br>
                <p>Trân trọng,<br>Touhou FM: Battle Card Team</p>
            `
        };

        await transporter.sendMail(mailOptions);

        res.json({ 
            success: true, 
            message: 'Mã xác thực đã được gửi đến email của bạn' 
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Có lỗi xảy ra, vui lòng thử lại' 
        });
    }
});

app.post('/api/verify', (req, res) => {
    try {
        const { email, code } = req.body;
        
        const verification = verificationCodes.get(email);
        
        if (!verification) {
            return res.status(400).json({ 
                success: false, 
                message: 'Mã xác thực không tồn tại hoặc đã hết hạn' 
            });
        }

        if (Date.now() > verification.expires) {
            verificationCodes.delete(email);
            return res.status(400).json({ 
                success: false, 
                message: 'Mã xác thực đã hết hạn' 
            });
        }

        if (verification.code !== code) {
            return res.status(400).json({ 
                success: false, 
                message: 'Mã xác thực không đúng' 
            });
        }

        verificationCodes.delete(email);
        
        registeredUsers.set(verification.username, {
            username: verification.username,
            password: verification.password,
            email: email,
            avatar: '/assets/reimu2.png', // Default avatar
            registeredAt: new Date(),
            stats: {
                aiWins: 0,
                aiLosses: 0,
                aiDraws: 0,
                onlineWins: 0,
                onlineLosses: 0,
                onlineDraws: 0
            }
        });
        
        console.log('User saved to database:', verification.username);
        console.log('Current registered users:', Array.from(registeredUsers.keys()));
        
        res.json({ 
            success: true, 
            message: 'Đăng ký thành công!'
        });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Có lỗi xảy ra, vui lòng thử lại' 
        });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng điền đầy đủ thông tin' 
            });
        }

        const user = registeredUsers.get(username);
        console.log('Login attempt for username:', username);
        console.log('Available users in database:', Array.from(registeredUsers.keys()));
        console.log('User found:', user ? 'Yes' : 'No');
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Tài khoản không tồn tại' 
            });
        }

        // Compare password with hashed password
        const passwordMatch = await bcrypt.compare(password, user.password);
        
        if (!passwordMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Mật khẩu không đúng' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Đăng nhập thành công!',
            user: {
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Có lỗi xảy ra, vui lòng thử lại' 
        });
    }
});

// User profile and avatar management
app.get('/api/profile/:username', (req, res) => {
    try {
        const { username } = req.params;
        const user = registeredUsers.get(username);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        res.json({ 
            success: true, 
            profile: {
                username: user.username,
                email: user.email,
                avatar: user.avatar || '/assets/reimu2.png',
                registeredAt: user.registeredAt,
                isOnline: true, // For now, assume all users are online
                lastSeen: new Date(),
                stats: user.stats || {
                    aiWins: 0,
                    aiLosses: 0,
                    aiDraws: 0,
                    onlineWins: 0,
                    onlineLosses: 0,
                    onlineDraws: 0
                }
            }
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

app.post('/api/update-avatar', (req, res) => {
    try {
        const { username, avatar } = req.body;
        
        if (!username || !avatar) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username and avatar are required' 
            });
        }
        
        const user = registeredUsers.get(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Update user's avatar
        user.avatar = avatar;
        registeredUsers.set(username, user);
        
        console.log(`Avatar updated for user ${username}: ${avatar}`);
        
        res.json({ 
            success: true, 
            message: 'Avatar updated successfully' 
        });
    } catch (error) {
        console.error('Avatar update error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

app.post('/api/user-profile', (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username is required' 
            });
        }
        
        const user = registeredUsers.get(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        res.json({ 
            success: true, 
            user: {
                username: user.username,
                email: user.email,
                avatar: user.avatar || '/assets/reimu2.png',
                registeredAt: user.registeredAt,
                isOnline: true, // For now, assume all users are online
                lastSeen: new Date(),
                stats: user.stats || {
                    aiWins: 0,
                    aiLosses: 0,
                    aiDraws: 0,
                    onlineWins: 0,
                    onlineLosses: 0,
                    onlineDraws: 0
                }
            }
        });
    } catch (error) {
        console.error('User profile fetch error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Test endpoint to set avatars for specific users
app.post('/api/set-test-avatars', (req, res) => {
    try {
        // Set specific avatars for testing
        const testUsers = {
            'thiendzz': '/assets/marisa.png',
            'thiencc': '/assets/cirno.png'
        };
        
        for (const [username, avatar] of Object.entries(testUsers)) {
            const user = registeredUsers.get(username);
            if (user) {
                user.avatar = avatar;
                registeredUsers.set(username, user);
                console.log(`Set avatar for ${username}: ${avatar}`);
            } else {
                console.log(`User ${username} not found`);
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Test avatars set successfully',
            users: Object.keys(testUsers)
        });
    } catch (error) {
        console.error('Set test avatars error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// AI Bot endpoints
app.get('/api/ai-difficulties', (req, res) => {
    res.json({
        success: true,
        difficulties: [
            { value: 'easy', name: 'Dễ', description: 'AI chơi ngẫu nhiên, thích hợp cho người mới' },
            { value: 'medium', name: 'Trung bình', description: 'AI có chiến thuật cơ bản' },
            { value: 'hard', name: 'Khó', description: 'AI có chiến thuật nâng cao' },
            { value: 'expert', name: 'Chuyên gia', description: 'AI chơi tối ưu, rất thách thức' }
        ]
    });
});

app.post('/api/create-ai-opponent', (req, res) => {
    try {
        const { difficulty, character } = req.body;
        
        // Validate difficulty
        const validDifficulties = ['easy', 'medium', 'hard', 'expert'];
        if (difficulty && !validDifficulties.includes(difficulty)) {
            return res.status(400).json({
                success: false,
                message: 'Độ khó không hợp lệ'
            });
        }
        
        // Validate character
        const validCharacters = ['Miko', 'Witch', 'Sakuya'];
        if (character && !validCharacters.includes(character)) {
            return res.status(400).json({
                success: false,
                message: 'Nhân vật không hợp lệ'
            });
        }
        
        // Create AI bot
        const aiBot = aiManager.createBot(null, character || 'Witch', difficulty || 'medium');
        
        res.json({
            success: true,
            bot: {
                id: aiBot.id,
                name: aiBot.name,
                character: aiBot.character,
                difficulty: aiBot.difficulty
            }
        });
    } catch (error) {
        console.error('Error creating AI opponent:', error);
        res.status(500).json({
            success: false,
            message: 'Không thể tạo đối thủ AI'
        });
    }
});

// ===== CARD GAME ENGINE =====
let cardGameWaiting = null; // socket id waiting for card game
const cardGameRooms = new Map(); // gameRoomId -> {players, phase, turn, ...}
let nextCardGameRoomId = 1;

// Initialize AI Bot Manager
const aiManager = new AIBotManager();

// Cleanup AI bots every hour
setInterval(() => {
    aiManager.cleanup();
}, 3600000);

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function makeDeckFromList(list) {
    return shuffle(list.slice());
}

function drawCards(state, count) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
        if (state.deck.length === 0) {
            // reshuffle discard
            state.deck = shuffle(state.discard);
            state.discard = [];
            if (state.deck.length === 0) break;
        }
        drawn.push(state.deck.pop());
    }
    state.hand.push(...drawn);
}

function validateDeck(cards) {
    if (!Array.isArray(cards)) return "Deck must be an array.";
    if (cards.length !== rules.DECK_MAX) {
        return `Deck size must be exactly ${rules.DECK_MAX}.`;
    }
    const counts = { attack:0, defend:0, heal:0, curse:0 };
    for (const c of cards) {
        if (!["attack","defend","heal","curse"].includes(c)) return "Unknown card type: " + c;
        counts[c]++;
    }
    for (const t of ["attack","defend","heal","curse"]) {
        if (counts[t] > rules.TYPE_LIMIT) return `Too many ${t} cards (max ${rules.TYPE_LIMIT}).`;
    }
    return null;
}

function publicCardGameState(room) {
    const now = Date.now();
    return {
        roomId: room.id,
        phase: room.phase,
        turn: room.turn,
        turnEndsAt: room.turnEndsAt,
        timerRemaining: Math.max(0, Math.floor((room.turnEndsAt - now) / 1000)),
        players: Object.fromEntries(Object.entries(room.players).map(([sid, p]) => [sid, ({
            name: p.name,
            character: p.character,
            hp: p.hp,
            shield: p.shield,
            specialUsed: p.specialUsed,
            submitted: !!room.submissions[sid],
            lastPlayed: room.lastPlayed[sid] || null
        })])),
    };
}

function privateCardGameState(room, sid) {
    const pub = publicCardGameState(room);
    const me = room.players[sid];
    return {
        ...pub,
        you: sid,
        hand: me.hand
    };
}

function startCardGameTurn(room) {
    room.phase = "play";
    room.turn += 1;
    console.log(`Starting turn ${room.turn} for room ${room.id}`); // Debug log
    room.submissions = {};
    room.lastPlayed = {};
    room.turnEndsAt = Date.now() + rules.TURN_SECONDS * 1000;

    // send fresh state to both players (with private hands)
    for (const sid of Object.keys(room.players)) {
        if (sid.startsWith("ai-bot-")) continue; // Don't send to AI
        io.to(sid).emit("cardgame/state", privateCardGameState(room, sid));
    }

    // Handle AI turn if this is an AI game
    if (room.isAIGame) {
        handleAITurn(room);
    }

    // schedule timeout check
    clearTimeout(room.timer);
    room.timer = setTimeout(() => {
        resolveCardGameTurn(room);
    }, rules.TURN_SECONDS * 1000 + 50);
}

function resolveCardGameTurn(room) {
    if (room.phase !== "play") return;

    room.phase = "resolve";

    // apply penalties for non-submission
    for (const [sid, p] of Object.entries(room.players)) {
        if (!room.submissions[sid]) {
            p.hp -= 20;
            room.lastPlayed[sid] = { card: null, note: "No play (-20 HP)" };
        }
    }

    // calculate effects
    const ids = Object.keys(room.players);
    if (ids.length !== 2) return; // sanity

    const [aId, bId] = ids;
    const A = room.players[aId];
    const B = room.players[bId];

    function applySubmission(source, target, sub, sid) {
        if (!sub) return;
        const { card, useSpecial } = sub;
        // Remove card from hand -> discard
        if (card != null && card >= 0 && card < source.hand.length) {
            const type = source.hand[card];
            source.discard.push(type);
            source.hand.splice(card, 1);

            let note = type;
            // Special handling
            if (useSpecial && !source.specialUsed) {
                if (source.character === "Miko" && type === "heal") {
                    // heal bonus +20 this turn
                    source._bonus = { heal: rules.SPECIALS.Miko.bonus };
                    source.specialUsed = true;
                    note += " + Special";
                } else if (source.character === "Witch" && type === "attack") {
                    source._bonus = { attack: rules.SPECIALS.Witch.bonus };
                    source.specialUsed = true;
                    note += " + Special";
                } else {
                    note += " (special had no effect)";
                }
            }

            // queue effect
            if (type === "defend") {
                source._queued = source._queued || [];
                source._queued.push({ kind: "shield", amount: rules.CARD_VALUES.defend });
            } else if (type === "heal") {
                // Nếu bị curse, heal sẽ giải curse và chỉ hồi +15HP, sau đó heal trở lại bình thường
                let healAmount = rules.CARD_VALUES.heal;
                if (source.curse && source.curse.turns > 0) {
                    healAmount = 15;
                    source.curse = null; // giải curse
                    source._curedCurse = true;
                }
                const bonus = (source._bonus && source._bonus.heal) || 0;
                source._queued = source._queued || [];
                source._queued.push({ kind: "heal", amount: healAmount + bonus });
            } else if (type === "attack") {
                const bonus = (source._bonus && source._bonus.attack) || 0;
                source._queued = source._queued || [];
                source._queued.push({ kind: "attack", amount: rules.CARD_VALUES.attack + bonus });
            } else if (type === "curse") {
                // Áp dụng curse lên đối phương nếu chưa bị hoặc đã hết
                if (!target.curse || !target.curse.turns || target.curse.turns <= 0) {
                    target.curse = { turns: rules.CURSE.duration };
                }
                // Ghi chú
                note += " (Curse)";
            }

            room.lastPlayed[sid] = { card: type, note };
        }
    }

    applySubmission(A, B, room.submissions[aId], aId);
    applySubmission(B, A, room.submissions[bId], bId);

    // Resolve order: shield/heal apply to self immediately, attacks then applied taking shield into account
    function applySelfEffects(p) {
        if (!p._queued) return;
        for (const eff of p._queued) {
            if (eff.kind === "shield") p.shield += eff.amount;
            if (eff.kind === "heal") p.hp = Math.min(rules.HP_START, p.hp + eff.amount);
        }
    }
    applySelfEffects(A);
    applySelfEffects(B);

    // Áp dụng hiệu ứng curse mỗi lượt (sau khi heal, trước attack)
    for (const p of [A, B]) {
        if (p.curse && p.curse.turns > 0) {
            p.hp -= rules.CURSE.hpDebuff;
            p.curse.turns--;
            if (p.curse.turns <= 0) p.curse = null;
        }
    }

    function dealDamage(target, amount) {
        let remaining = amount;
        const absorbed = Math.min(target.shield, remaining);
        target.shield -= absorbed;
        remaining -= absorbed;
        target.hp -= remaining;
    }

    function applyAttacks(source, target) {
        if (!source._queued) return;
        let atkDebuff = 0;
        if (source.curse && source.curse.turns > 0) {
            atkDebuff = rules.CURSE.atkDebuff;
        }
        for (const eff of source._queued) {
            if (eff.kind === "attack") dealDamage(target, Math.max(0, eff.amount - atkDebuff));
        }
    }
    applyAttacks(A, B);
    applyAttacks(B, A);

    // cleanup temp
    for (const p of [A,B]) {
        delete p._queued;
        delete p._bonus;
    }

    // draw up to hand size
    for (const p of [A,B]) {
        const need = Math.max(0, rules.HAND_SIZE - p.hand.length);
        drawCards(p, need);
    }

    // broadcast results
    for (const sid of Object.keys(room.players)) {
        io.to(sid).emit("cardgame/state", privateCardGameState(room, sid));
    }

    // check end conditions
    const someoneDead = A.hp <= 0 || B.hp <= 0;
    const turnLimit = room.turn >= rules.TURN_LIMIT;
    if (someoneDead || turnLimit) {
        room.phase = "end";
        const result = {
            a: { id: aId, hp: A.hp },
            b: { id: bId, hp: B.hp },
            turn: room.turn
        };
        io.to(room.id).emit("cardgame/end", result);
        
        // Update player stats
        const winnerHp = Math.max(A.hp, B.hp);
        const winnerId = A.hp > B.hp ? aId : B.hp > A.hp ? bId : null;
        const loserId = A.hp < B.hp ? aId : B.hp < A.hp ? bId : null;
        
        // Update stats for registered users
        const isAIGame = room.isAIGame;
        const aiId = isAIGame ? (aId.startsWith("ai-bot-") ? aId : bId) : null;
        const humanId = isAIGame ? (aId.startsWith("ai-bot-") ? bId : aId) : null;
        
        if (isAIGame && humanId) {
            // AI game stats
            const humanPlayer = registeredUsers.get(room.players[humanId].name);
            if (humanPlayer) {
                if (winnerId === humanId) {
                    humanPlayer.stats.aiWins++;
                } else if (loserId === humanId) {
                    humanPlayer.stats.aiLosses++;
                } else {
                    humanPlayer.stats.aiDraws++;
                }
                registeredUsers.set(room.players[humanId].name, humanPlayer);
            }
        } else {
            // Online multiplayer stats
            if (winnerId && !winnerId.startsWith("ai-bot-")) {
                const winner = registeredUsers.get(room.players[winnerId].name);
                if (winner) {
                    winner.stats.onlineWins++;
                    registeredUsers.set(room.players[winnerId].name, winner);
                }
            }
            if (loserId && !loserId.startsWith("ai-bot-")) {
                const loser = registeredUsers.get(room.players[loserId].name);
                if (loser) {
                    loser.stats.onlineLosses++;
                    registeredUsers.set(room.players[loserId].name, loser);
                }
            }
            if (!winnerId && !loserId) { // draw
                for (const pid of [aId, bId]) {
                    if (!pid.startsWith("ai-bot-")) {
                        const player = registeredUsers.get(room.players[pid].name);
                        if (player) {
                            player.stats.onlineDraws++;
                            registeredUsers.set(room.players[pid].name, player);
                        }
                    }
                }
            }
        }
        
        return;
    }

    // start next turn shortly
    setTimeout(() => startCardGameTurn(room), 800);
}

function createCardGameRoom(a, b) {
    const id = "cardgame-" + (nextCardGameRoomId++);
    const room = {
        id,
        players: {},
        phase: "deckbuild",
        turn: 0,
        turnEndsAt: 0,
        timer: null,
        submissions: {},
        lastPlayed: {}
    };
    cardGameRooms.set(id, room);

    for (const s of [a,b]) {
        s.join(id);
        room.players[s.id] = {
            id: s.id,
            name: s.data?.name || "Player",
            character: s.data?.character || "Miko",
            hp: rules.HP_START,
            shield: 0,
            deck: [],
            hand: [],
            discard: [],
            specialUsed: false
        };
    }

    io.to(id).emit("cardgame/matched", { roomId: id, phase: room.phase });
    for (const sid of [a.id, b.id]) {
        io.to(sid).emit("cardgame/state", privateCardGameState(room, sid));
    }
    return room;
}

// ===== AI BOT LOGIC =====
function createAIRoom(humanSocket, roomType = "single", aiDifficulty = "medium") {
    const id = "airoom-" + (nextCardGameRoomId++);
    
    // Clear any existing timers for this socket
    const existingRooms = [...cardGameRooms.values()];
    existingRooms.forEach(room => {
        if (room.timer) {
            clearTimeout(room.timer);
        }
    });
    
    // Get human player data
    const user = JSON.parse(humanSocket.data?.user || '{}');
    const humanPlayer = humanSocket.data?.name || user.username || "Player";
    const humanCharacter = humanSocket.data?.character || "Miko";
    
    // Get player stats for adaptive difficulty (only if not specified)
    let finalDifficulty = aiDifficulty;
    if (aiDifficulty === "adaptive") {
        const registeredUser = registeredUsers.get(humanPlayer);
        const playerStats = registeredUser?.stats || null;
        finalDifficulty = getAdaptiveDifficulty(playerStats);
    }
    
    // Create AI bot with specified difficulty
    const aiBot = aiManager.createBot(null, "Witch", finalDifficulty);
    aiBot.generateDeck();
    
    console.log(`Created AI room: ${id} with bot ${aiBot.name} (${aiBot.difficulty})`);
    
    const room = {
        id,
        players: {},
        phase: "deckbuild",
        turn: 0, // Always start from 0
        turnEndsAt: 0,
        timer: null,
        submissions: {},
        lastPlayed: {},
        isAIGame: true,
        aiBot: aiBot
    };
    cardGameRooms.set(id, room);
    
    console.log(`AI Room ${id} created with turn: ${room.turn}`); // Debug log

    // Add human player
    humanSocket.join(id);
    room.players[humanSocket.id] = {
        id: humanSocket.id,
        name: humanPlayer,
        character: humanCharacter,
        hp: rules.HP_START,
        shield: 0,
        deck: [],
        hand: [],
        discard: [],
        specialUsed: false
    };

    // Add AI bot player
    room.players[aiBot.id] = {
        id: aiBot.id,
        name: aiBot.name,
        character: aiBot.character,
        hp: aiBot.hp,
        shield: aiBot.shield,
        deck: aiBot.deck,
        hand: aiBot.hand,
        discard: aiBot.discard,
        specialUsed: aiBot.specialUsed
    };

    io.to(id).emit("cardgame/matched", { 
        roomId: id, 
        phase: room.phase, 
        isAIGame: true,
        aiOpponent: {
            name: aiBot.name,
            character: aiBot.character,
            difficulty: aiBot.difficulty
        }
    });
    io.to(humanSocket.id).emit("cardgame/state", privateCardGameState(room, humanSocket.id));
    
    return room;
}

// Helper function to get adaptive difficulty based on player stats
function getAdaptiveDifficulty(playerStats) {
    if (!playerStats) return "medium";
    
    const totalGames = (playerStats.aiWins || 0) + (playerStats.aiLosses || 0) + (playerStats.aiDraws || 0);
    if (totalGames === 0) return "medium";
    
    const winRate = (playerStats.aiWins || 0) / totalGames;
    
    if (winRate < 0.3) return "easy";
    if (winRate < 0.5) return "medium";
    if (winRate < 0.7) return "hard";
    return "expert";
}

// Helper function to get AI difficulty display name
function getAIDifficultyDisplayName(difficulty) {
    const names = {
        'easy': 'Dễ',
        'medium': 'Trung bình',
        'hard': 'Khó', 
        'expert': 'Chuyên gia'
    };
    return names[difficulty] || 'Trung bình';
}

function handleAITurn(room) {
    const aiBot = room.aiBot;
    if (!aiBot) return;
    
    const humanId = Object.keys(room.players).find(id => id !== aiBot.id);
    const humanPlayer = room.players[humanId];
    
    // Create game state for AI decision making
    const gameState = {
        turn: room.turn,
        players: room.players,
        phase: room.phase
    };
    
    // AI makes decision using the bot logic
    const decision = aiBot.makeDecision(gameState);
    
    // Submit AI decision after a delay to simulate thinking
    const thinkingTime = aiBot.difficulty === "easy" ? 500 + Math.random() * 1000 : 
                        aiBot.difficulty === "medium" ? 1000 + Math.random() * 1500 :
                        aiBot.difficulty === "hard" ? 1500 + Math.random() * 2000 :
                        2000 + Math.random() * 2500; // expert
    
    setTimeout(() => {
        if (room.phase === "play" && !room.submissions[aiBot.id]) {
            // Validate AI decision
            let finalDecision = decision;
            if (decision.cardIndex >= aiBot.hand.length || decision.cardIndex < 0) {
                finalDecision = { cardIndex: 0, useSpecial: false };
            }
            
            room.submissions[aiBot.id] = {
                card: finalDecision.cardIndex,
                useSpecial: finalDecision.useSpecial
            };
            
            io.to(room.id).emit("cardgame/submitted", { 
                player: aiBot.id,
                isAI: true 
            });
            
            console.log(`AI ${aiBot.name} submitted: card ${finalDecision.cardIndex}, special: ${finalDecision.useSpecial}`);
            
            // If both players have submitted, resolve turn
            if (Object.keys(room.submissions).length === Object.keys(room.players).length) {
                resolveCardGameTurn(room);
            }
        }
    }, thinkingTime);
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    // ===== CARD GAME SOCKET HANDLERS =====
    socket.data = { name: "Player", character: "Miko" };

    socket.on("cardgame/join", ({ name, character, isBot }) => {
        socket.data.name = name || "Player";
        socket.data.character = character || "Miko";

        if (isBot) {
            // Leave any existing rooms first
            const currentRooms = [...socket.rooms];
            currentRooms.forEach(roomId => {
                if (roomId.startsWith("cardgame-") || roomId.startsWith("airoom-")) {
                    socket.leave(roomId);
                    // Clean up the room if it exists
                    const existingRoom = cardGameRooms.get(roomId);
                    if (existingRoom) {
                        delete existingRoom.players[socket.id];
                        if (Object.keys(existingRoom.players).length === 0) {
                            cardGameRooms.delete(roomId);
                        }
                    }
                }
            });
            
            // Create AI room for single player
            const aiDifficulty = "medium"; // Default difficulty, could be passed from client
            const room = createAIRoom(socket, "single", aiDifficulty);
            socket.emit("cardgame/matched");
            socket.emit("cardgame/state", privateCardGameState(room, socket.id));
        } else {
            // Normal multiplayer matchmaking
            if (!cardGameWaiting) {
                cardGameWaiting = socket.id;
                socket.emit("cardgame/waiting");
            } else if (cardGameWaiting !== socket.id) {
                const other = io.sockets.sockets.get(cardGameWaiting);
                cardGameWaiting = null;
                const room = createCardGameRoom(other, socket);
                io.to(room.id).emit("cardgame/deckphase", { message: "Submit your deck (max 12, max 5 per type)." });
            }
        }
    });

    socket.on("cardgame/submitDeck", (cards) => {
        // find room
        const roomId = [...socket.rooms].find(r => r.startsWith("cardgame-") || r.startsWith("airoom-"));
        if (!roomId) return;
        const room = cardGameRooms.get(roomId);
        if (!room) return;
        const err = validateDeck(cards);
        if (err) {
            socket.emit("cardgame/deckError", err);
            return;
        }
        const P = room.players[socket.id];
        P.deck = makeDeckFromList(cards);
        P.hand = [];
        P.discard = [];
        P.hp = rules.HP_START;
        P.shield = 0;
        P.specialUsed = false;

        // draw opening hand
        for (let i = 0; i < rules.HAND_SIZE; i++) drawCards(P, 1);

        socket.emit("cardgame/deckOk");
        io.to(socket.id).emit("cardgame/state", privateCardGameState(room, socket.id));

        // Special handling for AI games
        if (room.isAIGame) {
            // Reset turn counter for new AI game
            room.turn = 0;
            console.log("Reset turn counter for AI game to:", room.turn);
            
            const aiBot = room.aiBot;
            if (aiBot) {
                // AI bot already has deck generated, just setup the player state
                const aiPlayer = room.players[aiBot.id];
                if (aiPlayer) {
                    aiPlayer.deck = [...aiBot.deck];
                    aiPlayer.hand = [...aiBot.hand];
                    aiPlayer.discard = [...aiBot.discard];
                    aiPlayer.hp = aiBot.hp;
                    aiPlayer.shield = aiBot.shield;
                    aiPlayer.specialUsed = aiBot.specialUsed;
                }
                // Start game immediately since AI is always ready
                startCardGameTurn(room);
                return;
            }
        }

        // Normal multiplayer game - check if both ready
        const ready = Object.values(room.players).every(p => p.deck.length > 0 && p.hand.length === rules.HAND_SIZE);
        if (ready) startCardGameTurn(room);
    });

    socket.on("cardgame/play", ({ cardIndex, useSpecial }) => {
        // record submission
        const roomId = [...socket.rooms].find(r => r.startsWith("cardgame-") || r.startsWith("airoom-"));
        if (!roomId) return;
        const room = cardGameRooms.get(roomId);
        if (!room || room.phase !== "play") return;

        const P = room.players[socket.id];
        if (!P) return;

        if (room.submissions[socket.id]) return; // already submitted

        // basic guard
        if (cardIndex != null && (cardIndex < 0 || cardIndex >= P.hand.length)) {
            socket.emit("cardgame/error", "Invalid card index.");
            return;
        }

        room.submissions[socket.id] = { card: cardIndex, useSpecial: !!useSpecial };
        io.to(room.id).emit("cardgame/submitted", { player: socket.id });

        // If both submitted, resolve now
        if (Object.keys(room.submissions).length === Object.keys(room.players).length) {
            resolveCardGameTurn(room);
        }
    });

    // ===== LOBBY ROOM MANAGEMENT (EXISTING) =====
    // Send current room list to new connection
    socket.emit('roomList', Array.from(gameRooms.values()));
    
    // Handle room creation
    socket.on('createRoom', (roomData) => {
        try {
            console.log('Creating room:', roomData);
            gameRooms.set(roomData.id, roomData);
            playerRooms.set(socket.id, roomData.id);
            
            // Track creator's socket
            if (roomData.players && roomData.players.length > 0) {
                playerSockets.set(roomData.players[0].id, socket.id);
                
                // Get creator's avatar from registered users
                const creator = registeredUsers.get(roomData.players[0].id);
                if (creator && creator.avatar) {
                    roomData.players[0].avatar = creator.avatar;
                }
            }
            
            // Join socket room
            socket.join(roomData.id);
            
            // Broadcast new room to all clients
            io.emit('roomCreated', roomData);
            
            // Send room joined confirmation to creator
            socket.emit('roomJoined', roomData);
            
            console.log(`Room ${roomData.id} created by ${roomData.host}`);
        } catch (error) {
            console.error('Error creating room:', error);
            socket.emit('error', { message: 'Không thể tạo phòng' });
        }
    });
    
    // Handle AI room creation (single player vs AI)
    socket.on('createAIRoom', (roomData) => {
        try {
            console.log('Creating AI room:', roomData);
            
            // Get AI difficulty from room data
            const aiDifficulty = roomData.aiDifficulty || 'medium';
            
            // Create AI card game room with specified difficulty
            const aiRoom = createAIRoom(socket, roomData.type, aiDifficulty);
            
            // For compatibility with existing room system, also create a lobby room
            const lobbyRoom = {
                ...roomData,
                players: [
                    roomData.players[0], // Human player
                    {
                        id: "ai-bot",
                        name: `AI Bot (${getAIDifficultyDisplayName(aiDifficulty)})`,
                        ready: true, // AI is always ready
                        avatar: "/assets/marisa.png" // AI uses Marisa avatar
                    }
                ],
                maxPlayers: 2, // Show 2 players for AI mode
                isAIRoom: true,
                aiDifficulty: aiDifficulty
            };
            
            gameRooms.set(roomData.id, lobbyRoom);
            playerRooms.set(socket.id, roomData.id);
            
            if (roomData.players && roomData.players.length > 0) {
                playerSockets.set(roomData.players[0].id, socket.id);
                
                const creator = registeredUsers.get(roomData.players[0].id);
                if (creator && creator.avatar) {
                    roomData.players[0].avatar = creator.avatar;
                }
            }
            
            socket.join(roomData.id);
            io.emit('roomCreated', lobbyRoom);
            socket.emit('roomJoined', lobbyRoom);
            
            console.log(`AI Room ${roomData.id} created by ${roomData.host} with difficulty: ${aiDifficulty}`);
        } catch (error) {
            console.error('Error creating AI room:', error);
            socket.emit('error', { message: 'Không thể tạo phòng AI' });
        }
    });
    
    // Handle joining room
    socket.on('joinRoom', (data) => {
        try {
            const { roomId, player, password } = data;
            const room = gameRooms.get(roomId);
            
            if (!room) {
                socket.emit('error', { message: 'Phòng không tồn tại' });
                return;
            }
            
            // Check password if room is locked
            if (room.status === 'Khóa') {
                console.log('Room is locked, checking password...');
                
                if (!room.password || room.password.trim() === '') {
                    // Room is locked but has no password set - shouldn't happen but handle it
                    socket.emit('error', { message: 'Phòng này đã bị khóa' });
                    return;
                }
                
                if (!password || password !== room.password) {
                    console.log('Password verification failed for room', roomId);
                    socket.emit('error', { message: 'Mật khẩu không đúng' });
                    return;
                }
                
                console.log('Password verification successful for room', roomId);
            }
            
            // Check if room is full
            if (room.players.length >= room.maxPlayers) {
                socket.emit('error', { message: 'Phòng đã đầy' });
                return;
            }
            
            // Check if player already in room
            const existingPlayer = room.players.find(p => p.id === player.id);
            if (existingPlayer) {
                socket.emit('error', { message: 'Bạn đã ở trong phòng này' });
                return;
            }
            
            // Add player to room
            room.players.push(player);
            playerRooms.set(socket.id, roomId);
            playerSockets.set(player.id, socket.id);
            
            // Get player's avatar from registered users
            const user = registeredUsers.get(player.id);
            if (user && user.avatar) {
                player.avatar = user.avatar;
            }
            
            // Join socket room
            socket.join(roomId);
            
            // Update room data
            gameRooms.set(roomId, room);
            
            // Notify all players in room
            io.to(roomId).emit('playerJoined', {
                roomId: roomId,
                player: player,
                players: room.players
            });
            
            // Send room data to joining player
            socket.emit('roomJoined', room);
            
            // Update room list for all clients
            io.emit('roomList', Array.from(gameRooms.values()));
            
            console.log(`Player ${player.name} joined room ${roomId}`);
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', { message: 'Không thể vào phòng' });
        }
    });
    
    // Handle leaving room
    socket.on('leaveRoom', (data) => {
        try {
            const { roomId, playerId } = data;
            const room = gameRooms.get(roomId);
            
            if (!room) return;
            
            // Remove player from room
            room.players = room.players.filter(p => p.id !== playerId);
            playerRooms.delete(socket.id);
            playerSockets.delete(playerId);
            
            // Leave socket room
            socket.leave(roomId);
            
            // If room is empty, delete it
            if (room.players.length === 0) {
                gameRooms.delete(roomId);
                console.log(`Room ${roomId} deleted (empty)`);
            } else {
                // Update room data
                gameRooms.set(roomId, room);
                
                // Notify remaining players
                io.to(roomId).emit('playerLeft', {
                    roomId: roomId,
                    playerId: playerId,
                    players: room.players
                });
            }
            
            // Update room list for all clients
            io.emit('roomList', Array.from(gameRooms.values()));
            
            console.log(`Player ${playerId} left room ${roomId}`);
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    });
    
    // Handle player ready status
    socket.on('playerReady', (data) => {
        try {
            console.log('Player ready event received:', data);
            const { roomId, playerId, ready } = data;
            const room = gameRooms.get(roomId);
            
            if (!room) {
                console.log('Room not found:', roomId);
                return;
            }

            console.log('Room found:', room);
            console.log('Room isAIRoom:', room.isAIRoom);
            console.log('Players structure:', room.players);

            // Handle both array and object structures for players
            let player;
            if (Array.isArray(room.players)) {
                player = room.players.find(p => p.id === playerId);
                console.log('Found player in array:', player);
            } else {
                player = room.players[playerId];
                console.log('Found player in object:', player);
            }
            
            if (player) {
                player.ready = ready;
                gameRooms.set(roomId, room);
                
                console.log(`Player ${playerId} ready status updated to: ${ready}`);
                
                // Notify all players in room
                io.to(roomId).emit('playerReady', {
                    roomId: roomId,
                    playerId: playerId,
                    ready: ready
                });
                
                // Auto-start AI game when human player is ready
                if (room.isAIRoom && ready && playerId !== "ai-bot") {
                    console.log('Conditions met for AI auto-start:', {
                        isAIRoom: room.isAIRoom,
                        ready: ready,
                        playerId: playerId,
                        notAI: playerId !== "ai-bot"
                    });
                    
                    setTimeout(() => {
                        console.log(`Starting AI game in room ${roomId}...`);
                        
                        // Start AI game immediately
                        io.to(roomId).emit('gameStart', {
                            roomId: roomId,
                            players: room.players,
                            isAIGame: true
                        });
                        
                        console.log(`AI Game auto-started in room ${roomId}`);
                        
                        // Remove room after game starts
                        gameRooms.delete(roomId);
                        io.emit('roomList', Array.from(gameRooms.values()));
                    }, 500); // Small delay for smooth UX
                } else {
                    console.log('AI auto-start conditions not met:', {
                        isAIRoom: room.isAIRoom,
                        ready: ready,
                        playerId: playerId,
                        notAI: playerId !== "ai-bot"
                    });
                }
                
                console.log(`Player ${playerId} ready status: ${ready} in room ${roomId}`);
            }
        } catch (error) {
            console.error('Error updating ready status:', error);
        }
    });
    
    // Handle avatar updates
    socket.on('avatarUpdate', (data) => {
        try {
            const { roomId, playerId, avatar } = data;
            const room = gameRooms.get(roomId);
            
            if (!room) return;
            
            const player = room.players.find(p => p.id === playerId);
            if (player) {
                // Update the player's avatar in the room data
                player.avatar = avatar;
                gameRooms.set(roomId, room);
                
                // Update the user's avatar in the registered users
                const user = registeredUsers.get(playerId);
                if (user) {
                    user.avatar = avatar;
                    registeredUsers.set(playerId, user);
                }
                
                // Broadcast avatar update to all players in the room
                io.to(roomId).emit('avatarUpdated', {
                    roomId: roomId,
                    playerId: playerId,
                    avatar: avatar
                });
                
                console.log(`Player ${playerId} avatar updated to ${avatar} in room ${roomId}`);
            }
        } catch (error) {
            console.error('Error updating avatar:', error);
        }
    });
    
    // Handle game start
    socket.on('startGame', (data) => {
        try {
            const { roomId } = data;
            const room = gameRooms.get(roomId);
            
            if (!room) return;
            
            // Handle AI room start
            if (room.isAIRoom) {
                // For AI room, only need 1 player to be ready
                if (room.players.length >= 1 && room.players[0].ready) {
                    // Redirect to card game
                    io.to(roomId).emit('gameStart', {
                        roomId: roomId,
                        players: room.players,
                        isAIGame: true
                    });
                    
                    console.log(`AI Game started in room ${roomId}`);
                    
                    // Remove room after game starts
                    gameRooms.delete(roomId);
                    io.emit('roomList', Array.from(gameRooms.values()));
                }
                return;
            }
            
            // Check if all players are ready (for normal multiplayer rooms)
            if (room.players.length === room.maxPlayers && room.players.every(p => p.ready)) {
                // Start game for all players in room
                io.to(roomId).emit('gameStart', {
                    roomId: roomId,
                    players: room.players
                });
                
                console.log(`Game started in room ${roomId}`);
                
                // Remove room after game starts
                gameRooms.delete(roomId);
                
                // Update room list
                io.emit('roomList', Array.from(gameRooms.values()));
            }
        } catch (error) {
            console.error('Error starting game:', error);
        }
    });
    
    // Handle getting room list
    socket.on('getRoomList', () => {
        // Clean up empty rooms and disconnected players before sending list
        cleanupRooms();
        socket.emit('roomList', Array.from(gameRooms.values()));
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Handle card game disconnect
        if (cardGameWaiting === socket.id) cardGameWaiting = null;
        // if in card game room, end game
        const cardGameRoomId = [...socket.rooms].find(r => r.startsWith("cardgame-"));
        if (cardGameRoomId) {
            const room = cardGameRooms.get(cardGameRoomId);
            if (room) {
                io.to(cardGameRoomId).emit("cardgame/end", { reason: "opponent_left" });
                cardGameRooms.delete(cardGameRoomId);
            }
        }
        
        // Find player by socket ID and remove from room
        let disconnectedPlayerId = null;
        for (const [playerId, socketId] of playerSockets.entries()) {
            if (socketId === socket.id) {
                disconnectedPlayerId = playerId;
                break;
            }
        }
        
        if (disconnectedPlayerId) {
            const roomId = playerRooms.get(socket.id);
            if (roomId) {
                const room = gameRooms.get(roomId);
                if (room) {
                    // Remove disconnected player from room
                    room.players = room.players.filter(p => p.id !== disconnectedPlayerId);
                    
                    console.log(`Player ${disconnectedPlayerId} disconnected from room ${roomId}`);
                    
                    // If room is empty, delete it
                    if (room.players.length === 0) {
                        gameRooms.delete(roomId);
                        console.log(`Room ${roomId} deleted (empty after disconnect)`);
                    } else {
                        // Update room data
                        gameRooms.set(roomId, room);
                        
                        // Notify remaining players
                        io.to(roomId).emit('playerLeft', {
                            roomId: roomId,
                            playerId: disconnectedPlayerId,
                            players: room.players
                        });
                    }
                    
                    // Update room list for all clients
                    io.emit('roomList', Array.from(gameRooms.values()));
                }
            }
            
            // Clean up tracking maps
            playerSockets.delete(disconnectedPlayerId);
        }
        
        playerRooms.delete(socket.id);
    });
});

// Helper function to clean up empty rooms and invalid players
function cleanupRooms() {
    const roomsToDelete = [];
    
    for (const [roomId, room] of gameRooms.entries()) {
        // Remove players whose sockets are no longer connected
        const validPlayers = room.players.filter(player => {
            const socketId = playerSockets.get(player.id);
            return socketId && io.sockets.sockets.has(socketId);
        });
        
        if (validPlayers.length !== room.players.length) {
            console.log(`Cleaned up ${room.players.length - validPlayers.length} disconnected players from room ${roomId}`);
            room.players = validPlayers;
        }
        
        // Mark empty rooms for deletion
        if (room.players.length === 0) {
            roomsToDelete.push(roomId);
        } else {
            // Update room with cleaned players
            gameRooms.set(roomId, room);
        }
    }
    
    // Delete empty rooms
    roomsToDelete.forEach(roomId => {
        gameRooms.delete(roomId);
        console.log(`Cleaned up empty room: ${roomId}`);
    });
    
    if (roomsToDelete.length > 0) {
        // Broadcast updated room list
        io.emit('roomList', Array.from(gameRooms.values()));
    }
}

server.listen(4000, () => {
    console.log('Listening on port 4000');
});
