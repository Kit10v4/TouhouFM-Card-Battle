# 🎴 Touhou Card Game - THFM: Card Battle

Một game thẻ bài multiplayer được lấy cảm hứng từ vũ trụ Touhou, với hệ thống âm thanh nâng cao và kỹ năng đặc biệt.

## ✨ Tính năng

### 🎮 Chế độ chơi

- **PvP Mode**: Đấu với người chơi khác online
- **AI Mode**: Đấu với bot AI với nhiều độ khó
- **Single Player**: Chế độ chơi đơn

### 🎵 Hệ thống âm thanh

- **BGM động**: Nhạc nền ngẫu nhiên với crossfade mượt mà
- **SFX thẻ bài**: Âm thanh cho từng loại thẻ (Attack, Heal, Shield, Curse)
- **Âm thanh kết quả**: Win/Lose/Draw sounds
- **Audio unlocking**: Tự động bypass browser autoplay policy

### 🃏 Hệ thống thẻ bài

- **4 loại thẻ**: Attack, Defend, Heal, Curse
- **Deck building**: Tự tạo bộ bài với tỷ lệ 5A/3D/4H/3C
- **Special Skills**: Kỹ năng đặc biệt cho từng nhân vật

### 👥 Nhân vật Touhou

- **Reimu Hakurei**: +20 Heal khi dùng special skill
- **Marisa Kirisame**: +25 Attack khi dùng special skill
- **Sakuya Izayoi**: Kỹ năng thời gian đặc biệt
- **Cirno**: Ice-based abilities

### 🛠️ Tính năng kỹ thuật

- **Real-time multiplayer** với Socket.IO
- **SQLite database** cho user management
- **JWT authentication**
- **Responsive design**
- **Debug console** với extensive logging

## 🚀 Cài đặt và chạy

### Yêu cầu hệ thống

- Node.js 14+
- npm hoặc yarn
- SQLite3

### Cài đặt

```bash
# Clone repository
git clone <repository-url>
cd touhou-card-game

# Cài đặt dependencies
npm install

# Chạy server
npm start
```

### Truy cập game

- Mở browser tại: `http://localhost:4000`
- Đăng ký/đăng nhập tài khoản
- Chọn chế độ chơi và bắt đầu!

## 🎯 Cách chơi

### Luật cơ bản

1. **Deck**: Mỗi người chơi có 15 thẻ (5 Attack, 3 Defend, 4 Heal, 3 Curse)
2. **HP**: Mỗi người bắt đầu với 100 HP
3. **Shield**: Có thể tích lũy để giảm damage
4. **Turns**: Mỗi turn chọn 1 thẻ để chơi
5. **Win condition**: Giảm HP đối thủ xuống 0

### Loại thẻ

- **⚔️ Attack**: Gây sát thương trực tiếp
- **🛡️ Defend**: Tăng shield để chống damage
- **💚 Heal**: Hồi phục HP
- **💜 Curse**: Giảm hiệu quả thẻ đối thủ

### Special Skills

- Mỗi nhân vật có 1 special skill/game
- Click nút Special Skill để kích hoạt
- Hiệu ứng visual khi active
- Tăng sức mạnh thẻ được chọn

## 📁 Cấu trúc dự án

```
touhou-card-game/
├── client/                 # Frontend files
│   ├── assets/            # Images và sprites
│   ├── audio/             # BGM và SFX files
│   │   ├── bgm/          # Background music
│   │   └── game/         # Game result sounds
│   ├── scripts/           # JavaScript modules
│   │   ├── bgm.js        # BGM management
│   │   └── sound.js      # SFX management
│   ├── gameAI.html       # AI mode interface
│   ├── gamePvP.html      # PvP mode interface
│   └── main_menu.html    # Main menu
├── server/                # Backend files
│   ├── db/               # Database setup
│   ├── routes/           # API routes
│   ├── utils/            # Utilities
│   └── server.js         # Main server
└── package.json          # Dependencies
```

## 🎨 Tính năng đặc biệt

### Audio System

- **Web Audio API** cho BGM với gain nodes
- **HTML5 Audio** cho SFX
- **Automatic unlocking** bypass browser restrictions
- **Dynamic crossfading** giữa các track BGM
- **Volume ducking** khi có SFX

### Visual Effects

- **Card animations** khi chơi thẻ
- **HP/Shield bars** với smooth transitions
- **Special skill glow effects**
- **Particle effects** cho damage/heal
- **Random backgrounds** cho mỗi game

### Multiplayer Features

- **Real-time synchronization**
- **Reconnection handling**
- **Room-based matchmaking**
- **Chat system** trong game
- **Spectator mode** (planned)

## 🐛 Debug và Development

### Console Commands

```javascript
// Trong browser console:
BGM.play(0); // Phát BGM track 0
BGM.setVolume(0.5); // Set volume 50%
playCardSound("attack"); // Test SFX
```

### Debug Flags

- BGM logs: `🎵` prefix
- SFX logs: `[SOUND]` prefix
- Special skills: `🎯` prefix
- Game state: Check browser console

## 🌐 Deploy Online

### Railway (Miễn phí & Dễ dàng)

1. **Tạo tài khoản**: Đăng ký tại [railway.app](https://railway.app)
2. **Deploy from GitHub**:
   - Click "New Project" 
   - Chọn "Deploy from GitHub repo"
   - Chọn repository `TouhouFM-Card-Battle`
   - Railway sẽ tự động deploy!

3. **Custom domain** (optional):
   - Vào Settings → Domains
   - Thêm custom domain hoặc dùng `.railway.app` domain

### Render (Alternative)

1. Đăng ký tại [render.com](https://render.com)
2. New → Web Service
3. Connect GitHub repository
4. Deploy settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### Heroku (Có phí)

```bash
# Cài Heroku CLI
npm install -g heroku

# Login và deploy
heroku login
heroku create touhou-card-battle
git push heroku main
```

## 📝 License

MIT License - Feel free to use and modify!

## 🤝 Contributing

1. Fork repository
2. Tạo feature branch
3. Commit changes
4. Push và tạo Pull Request

## 📞 Support

- GitHub Issues cho bug reports
- Discord server cho community chat
- Email: [your-email] cho support

---

**Enjoy the card battle in Gensokyo! 🌸**
