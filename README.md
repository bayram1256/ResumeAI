# ResumeAI

AI-платформа для анализа резюме, подбора вакансий и генерации сопроводительных писем. Пользователь загружает резюме, добавляет описание вакансии, получает оценку соответствия (fit score), AI-рекомендации по улучшению и экспортирует готовые документы в PDF/DOCX.

**Репозиторий:** [github.com/bayram1256/ResumeAI](https://github.com/bayram1256/ResumeAI)

---

## Возможности

- **Регистрация и авторизация** — JWT, защищённые маршруты API
- **Загрузка резюме** — парсинг PDF и DOCX, хранение в базе данных
- **Описания вакансий** — создание и управление job descriptions
- **Fit Score** — ML-модель оценивает соответствие резюме вакансии (навыки, опыт, образование)
- **AI-рекомендации** — предложения по улучшению резюме через Hugging Face (Qwen2.5)
- **Сопроводительные письма** — генерация cover letter под конкретную вакансию
- **Экспорт** — скачивание улучшенного резюме и писем в PDF/DOCX
- **5-шаговый workflow** — пошаговый интерфейс: загрузка → анализ → правки → повторный анализ → экспорт

---

## Технологии

| Слой | Стек |
|------|------|
| **Backend** | Node.js, Express 5, TypeScript, Prisma ORM |
| **База данных** | MySQL 8 |
| **AI** | Hugging Face Inference API (Qwen/Qwen2.5-7B-Instruct) |
| **ML** | Python, TensorFlow, scikit-learn (fit score model) |
| **Frontend** | HTML, Vanilla JS + React (islands pattern, CDN) |
| **Документы** | pdf-parse, mammoth, pdfkit, docx |
| **Инфраструктура** | Docker Compose |

---

## Структура проекта

```
ResumeAI/
├── Final-Project/          # Backend API
│   ├── src/
│   │   ├── controllers/    # auth, resume, job, workflow, coverLetter
│   │   ├── routes/         # REST-маршруты
│   │   ├── services/       # AI, fit score, parser, export
│   │   ├── middleware/     # JWT auth, upload, error handler
│   │   └── python/         # ML inference script
│   ├── prisma/             # схема БД и миграции
│   ├── model_assets/       # обученная ML-модель
│   ├── docker-compose.yml
│   └── Dockerfile.backend
│
└── frontend_son/           # Frontend UI
    ├── index.html          # страница входа / регистрации
    ├── dashboard.html      # основное приложение
    ├── js/react-ui.js      # React-компоненты (islands)
    └── improved-resume.html
```

---

## Быстрый старт (Docker)

Самый простой способ запустить весь стек:

```bash
cd Final-Project

# Создайте .env с API-ключом Hugging Face
echo 'HUGGINGFACE_API_KEY=ваш_ключ_здесь' > .env

docker compose up --build
```

После запуска:

| Сервис | URL |
|--------|-----|
| Backend API | http://localhost:5000 |
| Frontend | http://localhost:5501 |
| MySQL | localhost:3307 |

Проверка API: `curl http://localhost:5000/health` → `{"status":"ok"}`

---

## Локальная установка (без Docker)

### Требования

- Node.js 20+
- MySQL 8
- Python 3.11+ (для ML fit score)
- Hugging Face API key ([получить токен](https://huggingface.co/settings/tokens))

### 1. База данных

```bash
# Запустите MySQL и создайте базу
mysql -u root -p -e "CREATE DATABASE final_project;"
```

### 2. Backend

```bash
cd Final-Project

cp .env.example .env
# Отредактируйте .env — укажите DATABASE_URL, JWT_SECRET, HUGGINGFACE_API_KEY

npm install

# Python-зависимости для ML-модели
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-ml.txt

npx prisma generate
npx prisma migrate dev

npm run dev
```

Сервер запустится на **http://localhost:5000**

### 3. Frontend

```bash
cd frontend_son
python3 -m http.server 5501
```

Откройте **http://localhost:5501** в браузере.

> Используйте HTTP-сервер, а не `file://` — иначе API-запросы не будут работать.

---

## Переменные окружения

| Переменная | Описание | Пример |
|------------|----------|--------|
| `DATABASE_URL` | Строка подключения MySQL | `mysql://root:root@localhost:3307/final_project` |
| `JWT_SECRET` | Секрет для JWT-токенов | `your-secret-key` |
| `PORT` | Порт API-сервера | `5000` |
| `HUGGINGFACE_API_KEY` | API-ключ Hugging Face | `hf_...` |
| `HUGGINGFACE_MODEL` | Модель для генерации | `Qwen/Qwen2.5-7B-Instruct` |
| `AI_PROVIDER` | Провайдер AI | `huggingface` |
| `FIT_SCORE_MODEL_BUNDLE` | Путь к ML-бандлу | `./fit_score_model_bundle.zip` |
| `FIT_SCORE_MODEL_DIR` | Папка с моделью | `./model_assets` |
| `PYTHON_EXECUTABLE` | Путь к Python | `.venv/bin/python` |

---

## API

Все защищённые маршруты требуют заголовок `Authorization: Bearer <token>`.

### Аутентификация

| Метод | Маршрут | Описание |
|-------|---------|----------|
| `POST` | `/api/auth/register` | Регистрация |
| `POST` | `/api/auth/login` | Вход, получение JWT |

### Профиль

| Метод | Маршрут | Описание |
|-------|---------|----------|
| `GET` | `/api/profile` | Данные текущего пользователя |

### Резюме

| Метод | Маршрут | Описание |
|-------|---------|----------|
| `POST` | `/api/resumes/upload` | Загрузка резюме (PDF/DOCX) |
| `GET` | `/api/resumes` | Список резюме |
| `GET` | `/api/resumes/:id` | Одно резюме |
| `GET` | `/api/resumes/:id/download` | Скачать файл |
| `DELETE` | `/api/resumes/:id` | Удалить резюме |

### Вакансии

| Метод | Маршрут | Описание |
|-------|---------|----------|
| `POST` | `/api/jobs` | Создать описание вакансии |
| `GET` | `/api/jobs` | Список вакансий |
| `GET` | `/api/jobs/:id` | Одна вакансия |

### Workflow

| Метод | Маршрут | Описание |
|-------|---------|----------|
| `POST` | `/api/workflow/analyze` | Анализ fit score |
| `POST` | `/api/workflow/apply-suggestions` | Применить AI-рекомендации |
| `POST` | `/api/workflow/cover-letter` | Сгенерировать cover letter |
| `POST` | `/api/workflow/export` | Экспорт резюме (PDF/DOCX) |
| `GET` | `/api/workflow/exports/recent` | Последние экспорты |
| `GET` | `/api/workflow/exports/:id/download` | Скачать экспорт |

### Cover Letters

| Метод | Маршрут | Описание |
|-------|---------|----------|
| `GET` | `/api/cover-letters` | Список писем |
| `GET` | `/api/cover-letters/:id/download` | Скачать письмо |

---

## Как это работает

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Frontend   │────▶│  Express API │────▶│  MySQL (Prisma) │
│  :5501      │     │  :5000       │     └─────────────────┘
└─────────────┘     └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ ML Model │ │ Hugging  │ │ PDF/DOCX │
        │ Fit Score│ │ Face AI  │ │ Export   │
        └──────────┘ └──────────┘ └──────────┘
```

1. Пользователь регистрируется и загружает резюме
2. Добавляет описание вакансии
3. ML-модель считает fit score (навыки, опыт, образование)
4. AI генерирует рекомендации по улучшению резюме
5. Пользователь применяет правки и повторно анализирует
6. Экспортирует улучшенное резюме и cover letter

---

## Frontend

Гибридная архитектура — **React Islands**:

- Основная логика на Vanilla JS (auth, workflow, API-вызовы)
- 4 React-компонента для интерактивных виджетов:
  - `PasswordInput` — показ/скрытие пароля
  - `UserBadge` — аватар и email в сайдбаре
  - `FitScoreCircle` — круговой индикатор fit score
  - `SuggestionCard` — AI-рекомендации с чекбоксами

React подключается через CDN — **сборка не нужна**.

---

## Скрипты

```bash
cd Final-Project

npm run dev      # разработка (nodemon + ts-node)
npm run build    # компиляция TypeScript → dist/
npm run start    # запуск скомпилированного сервера
```

---

## Автор

**Bayram** — [github.com/bayram1256](https://github.com/bayram1256)
