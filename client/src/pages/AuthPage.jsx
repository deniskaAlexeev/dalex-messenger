import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RefreshCw, Eye, EyeOff, MessageSquare } from 'lucide-react';
import useAuthStore from '../hooks/useAuthStore';
import api from '../utils/api';
import styles from './AuthPage.module.css';

const AuthPage = ({ mode = 'login' }) => {
  const navigate = useNavigate();
  const { login, register } = useAuthStore();
  const isLogin = mode === 'login';

  const [form, setForm] = useState({
    login: '',
    username: '',
    displayName: '',
    email: '',
    password: '',
    captchaAnswer: ''
  });

  const [captcha, setCaptcha] = useState({ id: '', svg: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const fetchCaptcha = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/captcha');
      setCaptcha({ id: data.captchaId, svg: data.svg });
      setForm(f => ({ ...f, captchaAnswer: '' }));
    } catch {
      toast.error('Не удалось загрузить капчу');
    }
  }, []);

  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha, mode]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(e => ({ ...e, [name]: '' }));
  };

  const validate = () => {
    const newErrors = {};
    if (isLogin) {
      if (!form.login.trim()) newErrors.login = 'Введите имя или email';
      if (!form.password) newErrors.password = 'Введите пароль';
    } else {
      if (!form.username.trim()) newErrors.username = 'Введите имя пользователя';
      else if (!/^[a-zA-Z0-9_]{3,32}$/.test(form.username)) {
        newErrors.username = '3-32 символа: буквы, цифры, _';
      }
      if (!form.displayName.trim()) newErrors.displayName = 'Введите отображаемое имя';
      if (!form.email.trim()) newErrors.email = 'Введите email';
      if (!form.password) newErrors.password = 'Введите пароль';
      else if (form.password.length < 6) newErrors.password = 'Минимум 6 символов';
    }
    if (!form.captchaAnswer.trim()) newErrors.captchaAnswer = 'Введите код';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      if (isLogin) {
        await login({
          login: form.login,
          password: form.password,
          captchaId: captcha.id,
          captchaAnswer: form.captchaAnswer
        });
        toast.success('Добро пожаловать!');
      } else {
        await register({
          username: form.username,
          displayName: form.displayName,
          email: form.email,
          password: form.password,
          captchaId: captcha.id,
          captchaAnswer: form.captchaAnswer
        });
        toast.success('Регистрация успешна!');
      }
      navigate('/');
    } catch (err) {
      const msg = err.response?.data?.error || 'Ошибка. Попробуйте снова.';
      toast.error(msg);
      fetchCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.bg}>
        <div className={styles.bgGlow1} />
        <div className={styles.bgGlow2} />
        <div className={styles.grid} />
      </div>

      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <MessageSquare size={28} />
          </div>
          <div>
            <h1 className={styles.logoTitle}>ДАЛЕКС</h1>
            <p className={styles.logoDev}>by Денис Алексеев</p>
          </div>
        </div>

        <h2 className={styles.title}>
          {isLogin ? 'Войти в аккаунт' : 'Создать аккаунт'}
        </h2>

        <form onSubmit={handleSubmit} className={styles.form}>
          {isLogin ? (
            <Field
              label="Имя пользователя или Email"
              name="login"
              type="text"
              value={form.login}
              onChange={handleChange}
              error={errors.login}
              autoComplete="username"
              autoFocus
            />
          ) : (
            <>
              <Field
                label="Имя пользователя"
                name="username"
                type="text"
                value={form.username}
                onChange={handleChange}
                error={errors.username}
                hint="Только латинские буквы, цифры и _ "
                autoFocus
              />
              <Field
                label="Отображаемое имя"
                name="displayName"
                type="text"
                value={form.displayName}
                onChange={handleChange}
                error={errors.displayName}
              />
              <Field
                label="Email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                error={errors.email}
                autoComplete="email"
              />
            </>
          )}

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Пароль</label>
            <div className={styles.passwordWrap}>
              <input
                className={`${styles.input} ${errors.password ? styles.inputError : ''}`}
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={handleChange}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p className={styles.error}>{errors.password}</p>}
          </div>

          {/* Captcha */}
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Подтвердите, что вы не робот</label>
            <div className={styles.captchaRow}>
              <div
                className={styles.captchaSvg}
                dangerouslySetInnerHTML={{ __html: captcha.svg }}
              />
              <button
                type="button"
                className={styles.captchaRefresh}
                onClick={fetchCaptcha}
                title="Обновить"
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <input
              className={`${styles.input} ${errors.captchaAnswer ? styles.inputError : ''}`}
              name="captchaAnswer"
              type="text"
              value={form.captchaAnswer}
              onChange={handleChange}
              placeholder="Введите символы с картинки"
              autoComplete="off"
            />
            {errors.captchaAnswer && <p className={styles.error}>{errors.captchaAnswer}</p>}
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.spinner} />
            ) : (
              isLogin ? 'Войти' : 'Зарегистрироваться'
            )}
          </button>
        </form>

        <p className={styles.switchText}>
          {isLogin ? 'Ещё нет аккаунта? ' : 'Уже есть аккаунт? '}
          <Link to={isLogin ? '/register' : '/login'}>
            {isLogin ? 'Создать' : 'Войти'}
          </Link>
        </p>
      </div>
    </div>
  );
};

const Field = ({ label, name, type, value, onChange, error, hint, autoFocus, autoComplete }) => (
  <div className={styles.fieldGroup}>
    <label className={styles.label}>{label}</label>
    <input
      className={`${styles.input} ${error ? styles.inputError : ''}`}
      name={name}
      type={type}
      value={value}
      onChange={onChange}
      autoFocus={autoFocus}
      autoComplete={autoComplete}
    />
    {hint && !error && <p className={styles.hint}>{hint}</p>}
    {error && <p className={styles.error}>{error}</p>}
  </div>
);

export default AuthPage;
