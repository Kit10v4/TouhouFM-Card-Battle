// Initialize socket connection when available
let socket;
try {
  if (typeof io !== 'undefined') {
    socket = window.THFM_CONFIG?.createSocket
      ? window.THFM_CONFIG.createSocket()
      : io();
  } else {
    console.log('Socket.IO not loaded, some features may not work');
  }
} catch (error) {
  console.log('Socket.IO connection failed:', error.message);
}

function hideAllBoxes() {
	const loginBox = document.getElementById('login');
	const registerBox = document.getElementById('Register');
	const securityKeyBox = document.getElementById('SecurityKey');
	const forgotPasswordBox = document.getElementById('Forgot-Password');
	const loggedInBox = document.getElementById('logged-in');

	if (loginBox) loginBox.style.display = 'none';
	if (registerBox) registerBox.style.display = 'none';
	if (securityKeyBox) securityKeyBox.style.display = 'none';
	if (forgotPasswordBox) forgotPasswordBox.style.display = 'none';
	if (loggedInBox) loggedInBox.style.display = 'none';
}

function hideAllScreens() {
	hideAllBoxes();
	const mainMenu = document.getElementById('main-menu');
	if (mainMenu) mainMenu.style.display = 'none';
}

function showBox(boxId) {
	console.log('showBox called with:', boxId);
	hideAllBoxes();
	const boxElement = document.getElementById(boxId);
	console.log('Found element:', boxElement);
	if (boxElement) {
		boxElement.style.display = 'block';
		console.log('Set display to block for:', boxId);
	} else {
		console.log('❌ Element not found with ID:', boxId);
	}
	
}

function showMessage(message, isError = false) {
	const existingAlert = document.querySelector('.alert-message');
	if (existingAlert) {
		existingAlert.remove();
	}

	const alertDiv = document.createElement('div');
	alertDiv.className = `alert-message ${isError ? 'error' : 'success'}`;
	alertDiv.textContent = message;
	alertDiv.style.cssText = `
		position: fixed;
		top: 20px;
		right: 20px;
		padding: 15px 20px;
		border-radius: 5px;
		color: white;
		font-weight: bold;
		z-index: 1000;
		animation: slideIn 0.3s ease-out;
		background-color: ${isError ? '#dc3545' : '#28a745'};
	`;

	document.body.appendChild(alertDiv);

	setTimeout(() => {
		alertDiv.remove();
	}, 5000);
}

// Add null checks for DOM elements before setting onclick properties
const registerLb = document.querySelector('.register-lb');
console.log('Register link found:', registerLb);
if (registerLb) {
    registerLb.onclick = function() {
        console.log('Register link clicked, showing Register box');
        showBox('Register');
    };
} else {
    console.log('❌ Register link (.register-lb) not found!');
}

const forgotPasswordLb = document.querySelector('.forgot-password-lb');
if (forgotPasswordLb) {
    forgotPasswordLb.onclick = function() {
        showBox('Forgot-Password');
    };
}

const backBtns = document.querySelectorAll('.back-btn');
if (backBtns.length > 0) {
    backBtns.forEach(function(btn) {
        btn.onclick = function() {
            showBox('login');
        };
    });
}

const registerBtn = document.querySelector('.register-btn');
if (registerBtn) {
    registerBtn.onclick = async function(e) {
        e.preventDefault();
        
        const usernameField = document.querySelector('#Register .username-txt');
        const passwordField = document.querySelector('#Register .password-txt');
        const emailField = document.querySelector('#Register .email-txt');
        
        if (!usernameField || !passwordField || !emailField) {
            showMessage('Không thể tìm thấy các trường nhập liệu', true);
            return;
        }
        
        const username = usernameField.value.trim();
        const password = passwordField.value.trim();
        const email = emailField.value.trim();

        if (!username || !password || !email) {
            showMessage('Vui lòng điền đầy đủ thông tin', true);
            return;
        }

        if (username.length < 3) {
            showMessage('Tên tài khoản phải có ít nhất 3 ký tự', true);
            return;
        }

        if (password.length < 6) {
            showMessage('Mật khẩu phải có ít nhất 6 ký tự', true);
            return;
        }

        const registerBtn = this;
        const originalText = registerBtn.value;
        registerBtn.disabled = true;
        registerBtn.value = 'Đang xử lý...';
        registerBtn.style.opacity = '0.6';

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password, email })
            });

            // Check if response is JSON or HTML
            const contentType = response.headers.get('content-type');
            let data;

            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                // If it's HTML (rate limit page), treat as error
                const text = await response.text();
                data = {
                    success: false,
                    message: response.status === 429 ? 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút.' : 'Có lỗi xảy ra từ server.'
                };
            }

            if (data.success && data.securityKey) {
                const keyDisplay = document.querySelector('.security-key-display');
                if (keyDisplay) keyDisplay.textContent = data.securityKey;
                showBox('SecurityKey');
                showMessage('Tạo tài khoản thành công! Hãy lưu key bảo mật.');
            } else {
                showMessage(data.message || 'Đăng ký thất bại', true);
                showBox('Register');
            }
        } catch (error) {
            console.error('Registration error:', error);
            showMessage('Có lỗi xảy ra, vui lòng thử lại', true);
            showBox('Register');
        } finally {
            registerBtn.disabled = false;
            registerBtn.value = originalText;
            registerBtn.style.opacity = '1';
        }
    };
}

// Security key screen: copy + continue to login
const copyKeyBtn = document.querySelector('.copy-key-btn');
if (copyKeyBtn) {
    copyKeyBtn.onclick = async function() {
        const key = document.querySelector('.security-key-display')?.textContent?.trim();
        if (!key) return;
        try {
            await navigator.clipboard.writeText(key);
            showMessage('Đã sao chép key bảo mật');
        } catch (error) {
            showMessage('Không thể sao chép tự động, hãy chép tay key', true);
        }
    };
}

const keySavedBtn = document.querySelector('.key-saved-btn');
if (keySavedBtn) {
    keySavedBtn.onclick = function(e) {
        e.preventDefault();
        showBox('login');
    };
}

// Forgot password: reset using username + security key + new password
const resetPasswordBtn = document.querySelector('.reset-password-btn');
if (resetPasswordBtn) {
    resetPasswordBtn.onclick = async function(e) {
        e.preventDefault();

        const username = document.querySelector('.reset-username-txt')?.value.trim();
        const securityKey = document.querySelector('.reset-key-txt')?.value.trim();
        const newPassword = document.querySelector('.reset-newpass-txt')?.value.trim();

        if (!username || !securityKey || !newPassword) {
            showMessage('Vui lòng điền đầy đủ thông tin', true);
            return;
        }
        if (newPassword.length < 6) {
            showMessage('Mật khẩu mới phải có ít nhất 6 ký tự', true);
            return;
        }

        const btn = this;
        const originalText = btn.value;
        btn.disabled = true;
        btn.value = 'Đang xử lý...';
        btn.style.opacity = '0.6';

        try {
            const response = await fetch('/api/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, securityKey, newPassword })
            });

            const contentType = response.headers.get('content-type');
            let data;
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = {
                    success: false,
                    message: response.status === 429 ? 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút.' : 'Có lỗi xảy ra từ server.'
                };
            }

            if (data.success) {
                showMessage('Đặt lại mật khẩu thành công! Hãy đăng nhập.');
                showBox('login');
            } else {
                showMessage(data.message, true);
            }
        } catch (error) {
            console.error('Reset password error:', error);
            showMessage('Có lỗi xảy ra, vui lòng thử lại', true);
        } finally {
            btn.disabled = false;
            btn.value = originalText;
            btn.style.opacity = '1';
        }
    };
}

const loginBtn = document.querySelector('.login-btn');
if (loginBtn) {
    loginBtn.onclick = async function(e) {
        e.preventDefault();
        
        const usernameField = document.querySelector('#login .username-txt');
        const passwordField = document.querySelector('#login .password-txt');
        
        if (!usernameField || !passwordField) {
            showMessage('Không thể tìm thấy các trường nhập liệu', true);
            return;
        }
        
        const username = usernameField.value.trim();
        const password = passwordField.value.trim();

        if (!username || !password) {
            showMessage('Vui lòng điền đầy đủ thông tin', true);
            return;
        }

        const loginBtn = this;
        const originalText = loginBtn.value;
        loginBtn.disabled = true;
        loginBtn.value = 'Đang đăng nhập...';
        loginBtn.style.opacity = '0.6';

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                const text = await response.text();
                data = { 
                    success: false, 
                    message: response.status === 429 ? 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút.' : 'Có lỗi xảy ra từ server.'
                };
            }

            if (data.success) {
                sessionStorage.setItem('user', JSON.stringify(data.user));
                if (data.user.avatar) {
                    sessionStorage.setItem('userAvatar', data.user.avatar);
                }
                window.location.href = 'main_menu.html';
            } else {
                showMessage(data.message, true);
            }
        } catch (error) {
            console.error('Login error:', error);
            showMessage('Có lỗi xảy ra, vui lòng thử lại', true);
        } finally {
            loginBtn.disabled = false;
            loginBtn.value = originalText;
            loginBtn.style.opacity = '1';
        }
    };
}


window.onload = function() {
	const user = sessionStorage.getItem('user');
	console.log('User in storage:', user);
	
	if (user) {
		window.location.href = 'main_menu.html';
	} else {
		hideAllBoxes();
		document.getElementById('login').style.display = 'block';
	}
	
	// Setup button handlers after DOM is loaded
	const logoutBtn = document.querySelector('.logout-btn');
	if (logoutBtn) {
		logoutBtn.onclick = function() {
			sessionStorage.removeItem('user');
			window.location.href = 'index.html';
		};
	}

	const switchAccountBtn = document.querySelector('.switch-account-btn');
	if (switchAccountBtn) {
		switchAccountBtn.onclick = function() {
			sessionStorage.removeItem('user');
			window.location.href = 'index.html';
		};
	}
};
