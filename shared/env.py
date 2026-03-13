import os

from dotenv import load_dotenv


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_env_mode() -> str:
    return os.getenv("APP_ENV", "local").strip().lower() or "local"


def resolve_env_path() -> str:
    explicit_path = os.getenv("APP_ENV_FILE", "").strip()
    if explicit_path:
        return explicit_path

    mode = get_env_mode()
    if mode == "production":
        return os.path.join(PROJECT_ROOT, ".env.production")
    return os.path.join(PROJECT_ROOT, ".env")


def load_project_env() -> str:
    env_path = resolve_env_path()
    if os.path.exists(env_path):
        load_dotenv(env_path, override=False)
    return env_path
