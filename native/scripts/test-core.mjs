import {mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';

const build = join(process.cwd(), 'build', 'tests');
mkdirSync(build, {recursive: true});
const compiler = process.env.CXX || (process.platform === 'darwin' ? 'clang++' : 'g++');
const mode = process.env.SANITIZER;
const flags = ['-std=c++20', '-Wall', '-Wextra', '-Werror', '-pedantic', '-pthread', '-O1', '-g'];
if (mode) flags.push(`-fsanitize=${mode}`, '-fno-omit-frame-pointer');
const binary = join(build, 'audio-engine-tests');

function run(program, args) {
  const result = spawnSync(program, args, {stdio: 'inherit', timeout: 120000});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(compiler, [...flags, '-Imodules/artss-audio/cpp/core',
  'modules/artss-audio/cpp/core/AudioEngine.cpp', 'tests/audio-engine.test.cpp', '-o', binary]);
run(binary, []);
