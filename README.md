<div align="center">

<img src="public/icons/1024x1024.png" alt="orBIT Logo" width="128" height="128" />

# orBIT

**Быстрый и защищенный десктопный мессенджер со сквозным шифрованием**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-9c78ff.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-33.x-blue.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.x-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-N--API-orange.svg)](https://www.rust-lang.org/)

</div>

---

## О проекте

**orBIT** — легковесный и конфиденциальный десктопный мессенджер нового поколения. Проект ориентирован на максимальную приватность переписки, скорость работы интерфейса и независимость от централизованных провайдеров идентификации.

---

## Ключевые возможности

- **Сквозное шифрование (E2EE)**: протоколы Double Ratchet, X3DH, Curve25519/Ed25519 и AES-256-GCM. Приватные ключи и мнемоники хранятся исключительно локально на устройстве и никогда не передаются на сервер.
- **Голосовые и видеозвонки**: высокое качество и низкая задержка в личных и групповых комнатах на базе LiveKit и WebRTC.
- **Локальное зашифрованное хранилище**: локальная база данных SQLite для сохранения полной истории переписки и медиа-кеша с шифрованием на мастер-ключе.
- **Гибкая кастомизация интерфейса**: темы Material Design 3, адаптивные цветовые акценты, тонкая настройка шрифтов и скруглений.
- **Нативная производительность**: критичные операции вынесены в нативный модуль Rust (N-API).

---

## Стек технологий

| Слой | Стек |
| :--- | :--- |
| **Десктопная платформа** | Electron, Node.js |
| **Интерфейс** | React 19, TypeScript, Vite, Tailwind CSS, Material Design 3, Zustand |
| **Нативные модули** | Rust N-API (`native/` -> `index.node`) |
| **Реалтайм и звонки** | LiveKit, Pusher, Ably |
| **Хранилище** | SQLite (локально), Supabase (синхронизация) |

---

## Запуск и сборка

### Требования
- **Node.js**: версия 20.0 или выше
- **Rust**: актуальная версия `rustc` и `cargo` (для сборки модуля `native/`)

### Установка зависимостей
```bash
git clone https://github.com/orbitmsg/orBIT.git
cd orBIT
npm install
```

### Режим разработки
```bash
npm run dev
```

### Сборка приложения
```bash
npm run electron:build
```

Готовый установщик появится в директории `release/`.

---

## Лицензия

Проект **orBIT** распространяется под лицензией **GNU General Public License v3.0 (GPLv3)**. Полный текст доступен в файле [LICENSE](LICENSE).
