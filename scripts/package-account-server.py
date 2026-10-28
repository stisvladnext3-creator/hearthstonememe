"""Build a private REG.RU installer; never publish its ZIP or instructions."""
import argparse
import json
from pathlib import Path
import re
import secrets
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--output', default='private-deploy')
parser.add_argument('--admin-email', default='')
parser.add_argument('--admin-hash-file')
parser.add_argument('--database-name', default='')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
output = Path(args.output).resolve()
if root.joinpath('public') in [output, *output.parents] or root.joinpath('downloads') in [output, *output.parents]:
    raise SystemExit('Private installation files must stay outside public/downloads.')
output.mkdir(parents=True, exist_ok=True, mode=0o700)
key = secrets.token_hex(32)
seed = {'token': key, 'admin_email': args.admin_email, 'db_name_hint': args.database_name}
if args.admin_hash_file:
    digest = Path(args.admin_hash_file).read_text().strip()
    if not re.match(r'^(\$argon2id\$|\$2y\$|ms-sha256:\$2y\$)', digest):
        raise SystemExit('Expected a PHP native password hash.')
    seed['admin_hash'] = digest
def php_string(value):
    return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"
setup = '<?php\ndeclare(strict_types=1);\nreturn [' + ','.join(php_string(k) + '=>' + php_string(v) for k, v in seed.items()) + '];\n'
archive = output / 'memestone-accounts-reg-ru.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for path in sorted(root.joinpath('server/api').rglob('*')):
        if path.is_file() and path.name != 'setup-key.php':
            entry = zipfile.ZipInfo('memestone/api/' + path.relative_to(root / 'server/api').as_posix())
            entry.external_attr = 0o100644 << 16
            z.writestr(entry, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED)
    entry = zipfile.ZipInfo('memestone/api/setup-key.php')
    entry.external_attr = 0o100600 << 16
    z.writestr(entry, setup, compress_type=zipfile.ZIP_DEFLATED)
archive.chmod(0o600)
instructions = output / 'Установка-REG-RU.md'
instructions.write_text(f'''# Подключение аккаунтов Memestone

1. В файловом менеджере REG.RU открой папку сайта **moskompremont.online**. Загрузи сюда **memestone-accounts-reg-ru.zip** и распакуй. Внутри должна появиться папка `memestone/api`; файлы основного сайта заменять не нужно.
2. Открой **https://moskompremont.online/memestone/api/install.php**. Используй PHP 8.1 или новее, включённые `pdo_mysql`, `fileinfo`, `openssl` и HTTPS.
3. Введи ключ установки:

   `{key}`

4. Название базы: **{args.database_name or 'имя созданной базы'}**. Сервер обычно `localhost`, порт `3306`; проверь эти значения в панели базы. Введи **пользователя MySQL, которому выдан доступ к этой базе**, и его пароль. Это не пароль от личного кабинета REG.RU. Адрес игры в форме поставь **https://stisvladnext3-creator.github.io/hearthstonememe/**, если играешь по прежней ссылке GitHub Pages.
5. Нажми **Подключить базу и создать администратора**. Таблицы создаются автоматически, импорт SQL через phpMyAdmin не нужен. После успеха страница установки закроется. В игре открой **Профиль → Аккаунт**.

Администратор: **{args.admin_email or 'почта, введённая в установщике'}**. {'Подготовлен хеш ранее указанного пароля; пароль не нужно вводить заново.' if args.admin_hash_file else 'Пароль введи один раз в установщике.'}

Данные базы и картинки сохраняются вне публичной папки сайта. Эту инструкцию с ключом не загружай на сайт и не публикуй. ZIP нужен только владельцу хостинга. После распаковки удали загруженный ZIP из папки сайта.

Если возникает ошибка 503, проверь, что сайт включён и HTTPS работает. Если установщик сообщает об ошибке подключения — проверь сервер MySQL, полное имя базы и доступ её пользователя. Готовые таблицы вручную не удаляй.

Отправка писем для восстановления пароля включается отдельно после настройки почты домена (подробности в server/README.md). Регистрация и вход работают без почтового сервиса.
''', encoding='utf-8')
instructions.chmod(0o600)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert all(n.startswith('memestone/api/') for n in z.namelist())
print(json.dumps({'archive': str(archive), 'instructions': str(instructions), 'files': len(z.namelist())}, ensure_ascii=False))
