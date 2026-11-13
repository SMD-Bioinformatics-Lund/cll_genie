"""Exercise deployment replacement and rollback using a local fake Docker CLI."""
import json
import os
from pathlib import Path
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]
FAKE_DOCKER = '''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
p = Path(os.environ['FAKE_STATE'])
s = json.loads(p.read_text())
a = sys.argv[1:]
s['calls'].append(a)
code = 0
if a[0] == 'build':
    code = int(os.environ.get('FAIL_BUILD', '0'))
elif a[:2] == ['container', 'inspect']:
    code = 0 if a[2] in s['containers'] else 1
elif a[0] == 'inspect':
    print(str(s['containers'].get(a[-1], False)).lower())
elif a[0] == 'rename':
    s['containers'][a[2]] = s['containers'].pop(a[1])
elif a[0] == 'stop':
    s['containers'][a[1]] = False
elif a[0] == 'start':
    s['containers'][a[1]] = True
elif a[0] == 'run':
    name = a[a.index('--name')+1]
    s['containers'][name] = True
    code = int(os.environ.get('FAIL_RUN', '0'))
elif a[0] == 'exec':
    code = int(os.environ.get('FAIL_STARTUP', '0'))
elif a[0] == 'rm':
    s['containers'].pop(a[-1], None)
p.write_text(json.dumps(s))
sys.exit(code)
'''


def deploy(tmp_path, mode='production', failure=None, db_name='cll_genie_dev', port='43827', script_name=''):
    bin_dir = tmp_path / 'bin'
    bin_dir.mkdir()
    for name, text in [('docker', FAKE_DOCKER), ('sleep', '#!/bin/sh\nexit 0\n')]:
        p = bin_dir / name
        p.write_text(text)
        p.chmod(0o755)
    env_file = tmp_path / 'test.env'
    dirs = []
    for name in ['results', 'logs', 'input']:
        p = tmp_path / name
        p.mkdir()
        dirs.append(p)
    container = 'cll_genie_app_dev' if mode == 'development' else 'cll_genie_app'
    env_file.write_text(
        "SECRET_KEY='synthetic-secret'\nDB_HOST=localhost\nDB_PORT=27017\nAPP_DNS=\n"
        + f'CONTAINER_NAME={container}\n'
        + (f'SCRIPT_NAME="{script_name}"\n' if script_name is not None else '')
        + (f'PORT_NBR={port}\n' if port is not None else '')
        + (f'DB_NAME={db_name}\n' if db_name is not None else '')
        + f'RESULTS_DIR={dirs[0]}\nLOGS_DIR={dirs[1]}\nLYMPHOTRACK_RESULTS_DIR={dirs[2]}\n'
    )
    container = 'cll_genie_app_dev' if mode == 'development' else 'cll_genie_app'
    state = tmp_path / 'state.json'
    state.write_text(json.dumps({'containers': {container: True}, 'calls': []}))
    env = dict(os.environ, PATH=f'{bin_dir}:{os.environ["PATH"]}', FAKE_STATE=str(state))
    if failure:
        env[failure] = '1'
    script = 'install.dev.sh' if mode == 'development' else 'install.sh'
    result = subprocess.run(['bash', str(ROOT / 'scripts' / script), '-e', str(env_file)],
                            cwd=tmp_path, env=env, text=True, capture_output=True)
    return result, json.loads(state.read_text()), container


@pytest.mark.parametrize('mode', ['production', 'development'])
def test_successful_replacement_has_version_and_separate_runtime(tmp_path, mode):
    result, state, name = deploy(tmp_path, mode=mode, db_name='cll_genie_dev')
    assert result.returncode == 0, result.stderr
    assert state['containers'] == {name: True}
    assert f'CLL Genie {mode.title()} Deployment' in result.stdout
    assert f'CLL Genie {mode.title()} Deployment Complete' in result.stdout
    for message in ['[INFO] Using environment file:', '[INFO] Building Docker image:',
                    '[INFO] Docker image built successfully.', '[INFO] Verifying application startup...',
                    'Version:', 'Container:', 'Port:', 'Path:', 'Commit:', 'Build time:', 'URL:']:
        assert message in result.stdout
    run = next(call for call in state['calls'] if call[0] == 'run')
    assert 'synthetic-secret' not in str(state['calls']) + result.stdout + result.stderr
    assert 'SECRET_KEY' in run and 'CLL_GENIE_VERSION' in run
    assert '43827:43827' in run
    assert '0.0.0.0:43827' in run
    assert 'PORT_NBR' in run
    assert ('--reload' in run) == (mode == 'development')
    image = next(arg for arg in run if arg.startswith('cll_genie:'))
    assert image.endswith('-dev') == (mode == 'development')


@pytest.mark.parametrize('failure', ['FAIL_BUILD', 'FAIL_RUN', 'FAIL_STARTUP'])
def test_failed_deployment_preserves_or_restores_previous_container(tmp_path, failure):
    result, state, name = deploy(tmp_path, failure=failure)
    assert result.returncode != 0
    assert state['containers'] == {name: True}
    if failure == 'FAIL_BUILD':
        assert '[ERROR] Docker image build failed' in result.stderr
        assert not any(call[0] in ('rename', 'stop', 'rm', 'run') for call in state['calls'])
    else:
        assert '[WARN] Deployment failed' in result.stderr
        assert '[WARN] Rolling back production deployment...' in result.stderr
        assert '[INFO] Previous production container restored.' in result.stdout



@pytest.mark.parametrize('db_name', [None, 'cll_genie'])
def test_dev_requires_a_dedicated_database(tmp_path, db_name):
    result, state, _ = deploy(tmp_path, mode='development', db_name=db_name)
    assert result.returncode != 0
    assert 'DB_NAME' in result.stderr
    assert not state['calls']


def test_environment_secret_and_dev_cookie_are_preserved(monkeypatch):
    import importlib.util
    monkeypatch.setenv("SECRET_KEY", "synthetic-secret")
    spec = importlib.util.spec_from_file_location("install_config", ROOT / "config.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.DevelopmentConfig.SECRET_KEY == "synthetic-secret"
    assert module.ProductionConfig.SECRET_KEY == "synthetic-secret"
    assert module.DevelopmentConfig.SESSION_COOKIE_NAME != module.ProductionConfig.SESSION_COOKIE_NAME


@pytest.mark.parametrize('mode', ['production', 'development'])
@pytest.mark.parametrize('port', [None, '', 'abc', '0', '65536'])
def test_invalid_or_missing_port_stops_before_docker(tmp_path, mode, port):
    result, state, _ = deploy(tmp_path, mode=mode, db_name='cll_genie_dev', port=port)
    assert result.returncode != 0
    assert not state['calls']


@pytest.mark.parametrize('mode', ['production', 'development'])
def test_custom_port_controls_listener_and_mapping(tmp_path, mode):
    result, state, _ = deploy(tmp_path, mode=mode, db_name='cll_genie_dev', port='52791')
    assert result.returncode == 0, result.stderr
    run = next(call for call in state['calls'] if call[0] == 'run')
    assert '52791:52791' in run
    assert '0.0.0.0:52791' in run


@pytest.mark.parametrize('mode', ['production', 'development'])
def test_script_name_must_be_declared_including_when_root(tmp_path, mode):
    result, state, _ = deploy(tmp_path, mode=mode, script_name=None)
    assert result.returncode != 0
    assert 'SCRIPT_NAME' in result.stderr
    assert not state['calls']


@pytest.mark.parametrize('mode', ['production', 'development'])
def test_custom_script_name_is_passed_without_replacement(tmp_path, mode):
    result, state, _ = deploy(tmp_path, mode=mode, script_name='/custom-app')
    assert result.returncode == 0, result.stderr
    assert '/custom-app/' in result.stdout
    run = next(call for call in state['calls'] if call[0] == 'run')
    assert 'SCRIPT_NAME' in run


@pytest.mark.parametrize('mode', ['production', 'development'])
def test_inherited_prefix_does_not_replace_missing_env_file_setting(tmp_path, mode, monkeypatch):
    monkeypatch.setenv('SCRIPT_NAME', '/inherited')
    result, state, _ = deploy(tmp_path, mode=mode, script_name=None)
    assert result.returncode != 0
    assert 'SCRIPT_NAME' in result.stderr
    assert not state['calls']
