const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;
const DB_PATH = path.join(__dirname, 'club.db');

// =======================================================
// 1. KHỞI TẠO DATABASE VÀ HÀM WRAPPER (PROMISE/ASYNC)
// =======================================================

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Lỗi kết nối Database:', err.message);
    } else {
        console.log('🎉 Database SQLite đã kết nối thành công!');
        // Cấu hình timeout để giảm thiểu lỗi SQLITE_BUSY
        db.configure('busyTimeout', 5000); 
        createTables();
    }
});

// Hàm tiện ích: Wrapper cho db.run (trả về ID hoặc lỗi)
const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve({ id: this.lastID });
            }
        });
    });
};

// Hàm tiện ích: Wrapper cho db.get (trả về một dòng dữ liệu)
const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

// Hàm tiện ích: Wrapper cho db.all (trả về nhiều dòng dữ liệu)
const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

function createTables() {
    // Bảng lưu trữ đơn đăng ký chờ phê duyệt
    db.run(`CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        class TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        date_created TEXT
    )`, (err) => {
        if (err) {
            console.error('Lỗi khi tạo bảng registrations:', err.message);
        } else {
            console.log('Bảng registrations đã sẵn sàng.');
        }
    });

    // Bảng USERS (Lưu trữ thành viên và Admin)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user'
    )`, (err) => {
        if (err) {
            console.error('Lỗi khi tạo bảng users:', err.message);
        } else {
            console.log('Bảng users đã sẵn sàng.');
            db.get("SELECT COUNT(*) AS count FROM users", (err, row) => {
                if (row && row.count === 0) {
                    db.run(`INSERT INTO users (username, password, role) VALUES ('admin', '123', 'admin')`);
                    console.log('Đã thêm tài khoản admin mặc định: admin/123');
                }
            });
        }
    });
}


// =======================================================
// 2. CẤU HÌNH MIDDLEWARE
// =======================================================

app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true }));


// =======================================================
// 3. CÁC ROUTE API (ASYNC/AWAIT)
// =======================================================

// --- API ĐĂNG KÝ (POST /api/register) ---
app.post('/api/register', async (req, res) => {
    const { name, class: className, email } = req.body; 
    const date_created = new Date().toISOString();

    if (!name || !className || !email) {
        return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin.' });
    }

    try {
        const sql = 'INSERT INTO registrations (name, class, email, date_created) VALUES (?, ?, ?, ?)';
        await dbRun(sql, [name, className, email, date_created]); 
        
        console.log(`Đã thêm đăng ký mới vào DB: ${email}`);
        
        // Chuyển hướng sang trang thông báo thành công
        return res.redirect('/registration_success.html'); 
        
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
            // Nếu dùng fetch API, có thể trả về JSON
            return res.status(400).json({ success: false, message: 'Email này đã đăng ký rồi.' });
        }
        console.error('Lỗi khi lưu đăng ký:', err.message);
        return res.status(500).json({ success: false, message: 'Lỗi server khi lưu đăng ký vào Database.' });
    }
});

// --- API ĐĂNG NHẬP (POST /api/login) ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await dbGet('SELECT username, role FROM users WHERE username = ? AND password = ?', [username, password]);

        if (user) {
            return res.json({ success: true, role: user.role });
        } else {
            return res.status(401).json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
        }
    } catch (err) {
        console.error('Lỗi khi truy vấn đăng nhập:', err.message);
        return res.status(500).json({ success: false, message: 'Lỗi server khi đăng nhập.' });
    }
});

// --- API LẤY CHỈ SỐ DASHBOARD (GET /api/stats) ---
app.get('/api/stats', async (req, res) => {
    try {
        // 1. Đếm tổng số thành viên (role = 'user')
        const userCountRow = await dbGet("SELECT COUNT(*) AS count FROM users WHERE role = 'user'");
        
        // 2. Đếm tổng số đơn đăng ký mới
        const registrationCountRow = await dbGet("SELECT COUNT(*) AS count FROM registrations");
        
        // Dữ liệu giả lập
        const projectCount = 12; 
        const eventCount = 1;

        return res.json({
            success: true,
            stats: {
                memberCount: userCountRow ? userCountRow.count : 0,
                newRegistrationCount: registrationCountRow ? registrationCountRow.count : 0,
                totalProjectCount: projectCount,
                upcomingEventCount: eventCount
            }
        });

    } catch (err) {
        console.error('Lỗi khi lấy chỉ số Dashboard:', err.message);
        return res.status(500).json({ success: false, message: 'Lỗi server khi lấy chỉ số.' });
    }
});


// --- API LẤY DANH SÁCH ĐĂNG KÝ (GET /api/registrations) ---
app.get('/api/registrations', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM registrations ORDER BY date_created DESC');
        return res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Lỗi khi lấy dữ liệu đăng ký:', err.message);
        return res.status(500).json({ success: false, message: 'Lỗi server khi lấy dữ liệu.' });
    }
});


// --- API XỬ LÝ PHÊ DUYỆT/TỪ CHỐI (POST /api/registrations/approve-reject) ---
app.post('/api/registrations/approve-reject', async (req, res) => {
    const { id, action } = req.body; 

    if (!id || !action) {
        return res.status(400).json({ success: false, message: 'Thiếu ID hoặc hành động.' });
    }

    try {
        const registration = await dbGet('SELECT name, email FROM registrations WHERE id = ?', [id]);
        
        if (!registration) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn đăng ký.' });
        }

        if (action === 'approve') {
            const newUsername = registration.email.split('@')[0]; 
            const newPassword = '123'; 
            const newRole = 'user';

            const existingUser = await dbGet('SELECT username FROM users WHERE username = ?', [newUsername]);

            if (existingUser) {
                await dbRun('DELETE FROM registrations WHERE id = ?', [id]);
                return res.json({ success: false, message: `Tài khoản "${newUsername}" đã tồn tại. Đơn đăng ký đã bị xóa.` });
            }

            // Chèn user mới
            await dbRun('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', 
                [newUsername, newPassword, newRole]);
            
            // Xóa đơn đăng ký
            await dbRun('DELETE FROM registrations WHERE id = ?', [id]);
                
            console.log(`[APPROVE] Đã phê duyệt và thêm user: ${newUsername}.`);
            
            return res.json({ 
                success: true, 
                message: `Đã PHÊ DUYỆT ${registration.name}. Tài khoản: ${newUsername}/${newPassword}` 
            });

        } else if (action === 'reject') {
            
            // Xử lý Từ chối (chỉ xóa đơn đăng ký)
            await dbRun('DELETE FROM registrations WHERE id = ?', [id]);
                
            console.log(`[REJECT] Đã TỪ CHỐI đơn đăng ký ID: ${id}`);
            return res.json({ 
                success: true, 
                message: `Đã TỪ CHỐI đơn đăng ký của ${registration.name}.` 
            });

        } else {
            return res.status(400).json({ success: false, message: 'Hành động không hợp lệ.' });
        }

    } catch (err) {
        console.error('Lỗi khi xử lý phê duyệt:', err.message);
        return res.status(500).json({ success: false, message: 'Lỗi server khi thực hiện hành động Database.' });
    }
});


// =======================================================
// 4. PHỤC VỤ FILE TĨNH & KHỞI ĐỘNG SERVER
// =======================================================

// Route mặc định chuyển hướng đến trang Đăng nhập
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// Khởi động Server
app.listen(port, () => {
    console.log(`Server đang chạy tại: http://localhost:${port}`);
    console.log(`Trang Đăng nhập: http://localhost:${port}/login.html`);
    console.log(`Bảng Admin: http://localhost:${port}/admin.html`);
});

// Đóng kết nối DB khi ứng dụng tắt
process.on('SIGINT', () => {
    db.close(() => {
        console.log('Database SQLite đã đóng.');
        process.exit(0);
    });
});