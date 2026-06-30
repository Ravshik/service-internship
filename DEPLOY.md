# Деплой проекта

Проект запускается в Docker как Node.js сервер. Он отдает мини-приложение и хранит общие даты/заявки в файле `data/db.json`.

## Файлы

- `index.html` - основное мини-приложение.
- `puzzlebot-embed.html` - версия для HTML-блока Пазл Бота.
- `server.js` - backend/API для общих дат и заявок.
- `package.json` - зависимости Node.js.
- `Dockerfile` - сборка контейнера.
- `docker-compose.yml` - запуск контейнера.
- `data/db.json` - база заявок, создается автоматически на сервере.

## Установка Docker на сервере

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo systemctl enable --now docker
```

Проверка:

```bash
docker --version
docker compose version
git --version
```

## Первый деплой через GitHub

На GitHub нужно создать репозиторий и загрузить туда этот проект.

После этого на сервере:

```bash
cd ~/ravshan
git clone https://github.com/USERNAME/REPO.git service-internship-booking
cd service-internship-booking
docker compose up -d --build
```

`USERNAME/REPO` нужно заменить на адрес твоего репозитория.

## Запуск

На сервере:

```bash
cd ~/ravshan/service-internship-booking
docker compose up -d --build
```

## Telegram-уведомления

Чтобы стажеру приходили личные сообщения из основного бота `@LOFT_HELPER_V2_BOT`, приложение должно открываться из этого же бота как Telegram Web App. Тогда Telegram передает сайту ID пользователя, а сервер сохраняет его в заявке.

На сервере в папке проекта создай файл `.env`:

```bash
cd ~/ravshan/service-internship-booking
nano .env
```

Добавь туда:

```env
TELEGRAM_BOT_TOKEN=токен_основного_бота
TELEGRAM_BOT_USERNAME=LOFT_HELPER_V2_BOT
```

Не добавляй `TELEGRAM_POLLING=yes`, если бот подключен к PuzzleBot. Сервер не должен читать `/start`, иначе будет конфликт с PuzzleBot. Для отправки личных сообщений polling не нужен.

Потом перезапусти приложение:

```bash
docker compose up -d --build
```

В основном боте/PuzzleBot сделай кнопку записи, которая открывает:

```text
https://l-core.online/?v=mainbot1
```

Если PuzzleBot поддерживает тип кнопки Web App, используй именно Web App. Если есть только обычная ссылка, тоже можно, но она должна открываться из Telegram. Когда стажер создаст заявку из этой формы, Telegram привяжется автоматически.

Проверка:

```bash
docker ps
curl http://localhost:3000/health
```

После запуска приложение будет доступно внутри сервера:

```text
http://151.244.243.164:3000
```

## Обновление

После изменения файлов:

```bash
cd ~/ravshan/service-internship-booking
git pull
docker compose up -d --build
```

Или одной командой:

```bash
cd ~/ravshan/service-internship-booking
bash deploy.sh
```

## Остановка

```bash
docker compose down
```

## Что не хранится в GitHub

В репозиторий не должны попадать:

- `node_modules/`
- `data/`
- `.env`

Заявки и даты на сервере лежат в:

```text
data/db.json
```

Этот файл остается на сервере и не затирается при `git pull`.

## Важно

Даты и заявки теперь хранятся на сервере в `data/db.json`, поэтому рекрут видит заявки, созданные с других устройств.

Профиль стажера в форме хранится локально в браузере, чтобы человеку не вводить ФИО заново. Общий список заявок хранится на сервере.

Следующим шагом можно заменить JSON-файл на PostgreSQL/SQLite и добавить авторизацию рекрутов через Telegram ID.
