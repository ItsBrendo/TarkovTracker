const adminPanel = document.querySelector('#admin-panel');
const adminForm = document.querySelector('#admin-create-form');
const adminMessage = document.querySelector('#admin-message');
const adminUsers = document.querySelector('#admin-users');
let activeAdminId = '';

function setAdminMessage(message, isError = false) {
  adminMessage.textContent = message;
  adminMessage.dataset.state = isError ? 'error' : 'ready';
}

async function adminRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

function createUserRow(user) {
  const row = document.createElement('tr');
  const usernameCell = document.createElement('td');
  const usernameInput = document.createElement('input');
  usernameInput.type = 'text';
  usernameInput.value = user.username;
  usernameInput.minLength = 2;
  usernameInput.maxLength = 32;
  usernameInput.pattern = '[A-Za-z0-9_.\\x2d]+';
  usernameInput.setAttribute('aria-label', `Username for ${user.username}`);
  usernameCell.append(usernameInput);

  const roleCell = document.createElement('td');
  const roleSelect = document.createElement('select');
  roleSelect.setAttribute('aria-label', `Role for ${user.username}`);
  for (const [value, label] of [['user', 'Standard user'], ['admin', 'Administrator']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    roleSelect.append(option);
  }
  roleSelect.value = user.role;
  roleCell.append(roleSelect);

  const passwordCell = document.createElement('td');
  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.minLength = 12;
  passwordInput.maxLength = 128;
  passwordInput.autocomplete = 'new-password';
  passwordInput.placeholder = 'Leave blank to keep';
  passwordInput.setAttribute('aria-label', `New password for ${user.username}`);
  passwordCell.append(passwordInput);

  const actionCell = document.createElement('td');
  actionCell.className = 'admin-row-actions';
  const saveButton = document.createElement('button');
  saveButton.className = 'text-button';
  saveButton.type = 'button';
  saveButton.textContent = 'Save';
  saveButton.addEventListener('click', async () => {
    if (!usernameInput.reportValidity()) return;
    saveButton.disabled = true;
    const body = { username: usernameInput.value.trim(), role: roleSelect.value };
    if (passwordInput.value) body.password = passwordInput.value;
    try {
      await adminRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PUT', body: JSON.stringify(body)
      });
      if (user.id === activeAdminId && body.password) {
        window.location.replace('/login.html');
        return;
      }
      setAdminMessage(`Updated ${body.username}.`);
      await loadAdminUsers();
    } catch (error) {
      setAdminMessage(error.message, true);
    } finally {
      saveButton.disabled = false;
    }
  });

  const deleteButton = document.createElement('button');
  deleteButton.className = 'text-button admin-delete';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Remove';
  deleteButton.addEventListener('click', async () => {
    if (!window.confirm(`Remove ${user.username} and revoke their sessions?`)) return;
    deleteButton.disabled = true;
    try {
      await adminRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      setAdminMessage(`Removed ${user.username}.`);
      await loadAdminUsers();
    } catch (error) {
      setAdminMessage(error.message, true);
    } finally {
      deleteButton.disabled = false;
    }
  });
  actionCell.append(saveButton, deleteButton);
  row.append(usernameCell, roleCell, passwordCell, actionCell);
  return row;
}

async function loadAdminUsers() {
  const { users } = await adminRequest('/api/admin/users');
  adminUsers.replaceChildren(...users.map(createUserRow));
}

adminForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!adminForm.reportValidity()) return;
  const submitButton = adminForm.querySelector('button[type="submit"]');
  const formData = new FormData(adminForm);
  const body = {
    username: String(formData.get('username')).trim(),
    role: String(formData.get('role'))
  };
  const password = String(formData.get('password') || '');
  if (password) body.password = password;
  submitButton.disabled = true;
  try {
    await adminRequest('/api/admin/users', { method: 'POST', body: JSON.stringify(body) });
    adminForm.reset();
    setAdminMessage(`Added ${body.username}.`);
    await loadAdminUsers();
  } catch (error) {
    setAdminMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

adminRequest('/api/auth/session')
  .then(({ user }) => {
    if (user?.role !== 'admin') return;
    activeAdminId = user.id;
    adminPanel.hidden = false;
    return loadAdminUsers();
  })
  .catch(() => {});