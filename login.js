const ADMIN_USERNAME = 'KillaFromKmart';
const loginForm = document.querySelector('#login-form');
const usernameInput = document.querySelector('#username');
const passwordInput = document.querySelector('#password');
const usernameStep = document.querySelector('#username-step');
const passwordStep = document.querySelector('#password-step');
const passwordLabel = document.querySelector('#password-label');
const loginAccount = document.querySelector('#login-account');
const loginMessage = document.querySelector('#login-message');
const backButton = document.querySelector('#back-button');

function showPasswordStep() {
  const username = usernameInput.value.trim();
  if (!usernameInput.checkValidity()) {
    usernameInput.reportValidity();
    return;
  }

  usernameStep.hidden = true;
  passwordStep.hidden = false;
  passwordLabel.textContent = username.toLowerCase() === ADMIN_USERNAME.toLowerCase()
    ? 'Admin password'
    : 'Password';
  loginAccount.textContent = username;
  loginMessage.textContent = '';
  passwordInput.value = '';
  passwordInput.focus();
}

function showUsernameStep() {
  passwordStep.hidden = true;
  usernameStep.hidden = false;
  passwordInput.value = '';
  loginMessage.textContent = '';
  usernameInput.focus();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (passwordStep.hidden) {
    showPasswordStep();
    return;
  }

  if (!passwordInput.value) {
    passwordInput.reportValidity();
    return;
  }

  const submitButton = passwordStep.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  loginMessage.textContent = 'VERIFYING CREDENTIALS...';
  loginMessage.dataset.state = 'pending';

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: usernameInput.value.trim(), password: passwordInput.value })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Access denied. Check your credentials.');
    loginMessage.textContent = 'ACCESS GRANTED';
    loginMessage.dataset.state = 'success';
    window.location.replace('/');
  } catch (error) {
    loginMessage.textContent = error instanceof TypeError
      ? 'The authentication service is unavailable. Try again shortly.'
      : error.message;
    loginMessage.dataset.state = 'error';
    passwordInput.select();
  } finally {
    submitButton.disabled = false;
  }
});

backButton.addEventListener('click', showUsernameStep);

fetch('/api/auth/session', { headers: { Accept: 'application/json' } })
  .then((response) => {
    if (response.ok) window.location.replace('/');
  })
  .catch(() => {});