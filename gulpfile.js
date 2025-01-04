// ファイルの最初に追加
process.argv.push('--no-deprecation');

const gulp = require('gulp');
const browserSync = require('browser-sync').create();
const plumber = require('gulp-plumber');
const pug = require('gulp-pug');
const pugbem = require('gulp-pugbem');
const sass = require('gulp-sass')(require('sass')); // sassを最新に更新
const postcss = require('gulp-postcss');
const cssnext = require('postcss-cssnext');
const rename = require('gulp-rename');
const fs = require('fs').promises;
const replace = require('gulp-replace');
const data = require('gulp-data');
const path = require('path');
const newer = require('gulp-newer');

// パスの設定
const srcpaths = {
    scss: './src/**/*.scss',
    sass: './src/**/*.sass',
    jsx: './src/jsx/**/*.js',
    pug: './src/pug/**/*.pug',
    envPug: './src/pug/lms-moodle/**/*.pug'
};

const dstpaths = {
    css: './static/css',
    js: './static/js',
    stg: './moodle-stg',
    lmswaomirai: './moodle-lms'
};

// stg.js と lms.js を分割するタスク（非同期処理を減らし、gulpで同期的に処理）
async function splitJs(done) {
    try {
        const stgVariableJsContent = await fs.readFile(path.resolve('src/jsx/stg-variable.js'), 'utf8');
        const lmsVariableJsContent = await fs.readFile(path.resolve('src/jsx/lms-variable.js'), 'utf8');

        // stg.js 用
        gulp.src('src/jsx/moodle.js')
            .pipe(replace(/^/,
                `${stgVariableJsContent}\n` +
                `$(document).ready(function() {\n` +
                `    const tenantIdNumber = $("html").data("tenantidnumber");\n` +
                `    if (tenantIdNumber === "stg") {\n`))
            .pipe(replace(/$/,
                `   }\n` +
                `});`))
            .pipe(rename('stg.js'))
            .pipe(gulp.dest(dstpaths.js));

        // lms.js 用
        gulp.src('src/jsx/moodle.js')
            .pipe(replace(/^/,
                `${lmsVariableJsContent}\n` +
                `$(document).ready(function() {\n` +
                `    const tenantIdNumber = $("html").data("tenantidnumber");\n` +
                `    if (tenantIdNumber === "lmswaomirai") {\n`))
            .pipe(replace(/$/,
                `   }\n` +
                `});`))
            .pipe(rename('lmswaomirai.js'))
            .pipe(gulp.dest(dstpaths.js));

        done();
    } catch (err) {
        console.error('Error reading files:', err);
        done(err);
    }
}

// ローカルサーバーの起動と監視タスク
function serve() {
    browserSync.init({
        server: "./",
        index: "index.html"
    });

    gulp.watch([srcpaths.scss, srcpaths.sass], gulp.series(scss, (done) => {
        browserSync.reload();
        done();
    }));

    // 通常のPugファイルの監視（lms-moodleを除く）
    // gulp.watch(
    //     [srcpaths.pug, '!./src/pug/lms-moodle/**/*.pug'],
    //     gulp.series(pugTask, (done) => {
    //         browserSync.reload();
    //         done();
    //     })
    // );

    // lms-moodle 配下のみ変更された時に pugStg と pugLms を実行

    // gulp.watch(srcpaths.envPug, gulp.series(pugStg, pugLms, (done) => {
      //     browserSync.reload();
      //     done();
    // }));
    gulp.watch('src/pug/index.pug', gulp.series(pugIndexPage,  (done) => {
      browserSync.reload();
      done();
   }));
  
    gulp.watch('src/pug/lms-moodle/**/*.pug', gulp.series(pugStgSingle,pugLmsSingle,  (done) => {
        browserSync.reload();
        done();
    }));
  
    gulp.watch(srcpaths.jsx, gulp.series(splitJs, (done) => {
        browserSync.reload();
        done();
    }));
}

// stg, lms専用のPugタスク
function pugEnvTask(envValue, outputPath) {
  return gulp.src(['src/pug/lms-moodle/**/*.pug', '!src/pug/lms-moodle/**/_*.pug'])
      .pipe(plumber())
      .pipe(data(() => ({ env: envValue })))  // 'env'に値を渡す
      .pipe(pug({ plugins: [pugbem] }))
      .pipe(gulp.dest(outputPath));  // 出力先を動的に変更
}
function pugEnvTaskSingle(envValue, outputPath) {
  return gulp.src(['src/pug/lms-moodle/**/*.pug', '!src/pug/lms-moodle/**/_*.pug'])
      .pipe(plumber())
      .pipe(newer({
        dest: outputPath,
        ext: '.html'  // 出力ファイルの拡張子を明示
      }))
      .pipe(data(() => ({ env: envValue })))  // 'env'に値を渡す
      .pipe(pug({ plugins: [pugbem] }))
      .pipe(gulp.dest(outputPath));  // 出力先を動的に変更
}

// stg用Pugタスク
function pugStg() {
  return pugEnvTask('stg', './moodle-stg');
}
// stg用Pugタスク
function pugLms() {
  return pugEnvTask('lmswaomirai', './moodle-lms');
}

// stg用Pugタスク
function pugStgSingle() {
  return pugEnvTaskSingle('stg', './moodle-stg');
}
// stg用Pugタスク
function pugLmsSingle() {
  return pugEnvTaskSingle('lmswaomirai', './moodle-lms');
}

function pugIndexPage() {
  return gulp.src(['src/pug/index.pug'])
      .pipe(plumber())
      .pipe(pug({ plugins: [pugbem] }))
      .pipe(gulp.dest("./")); 
}

// SCSSタスク
function scss() {
    const processors = [cssnext()];
    return gulp.src([srcpaths.scss, srcpaths.sass])
        .pipe(plumber())
        .pipe(
          sass({
              quietDeps: true // Sassの警告を抑制
          }).on('error', sass.logError)
        )
        .pipe(postcss(processors))
        .pipe(gulp.dest(dstpaths.css))
        .pipe(browserSync.stream());
}

// デフォルトタスク
exports.default = gulp.series(scss, serve, pugStg, pugLms, pugIndexPage);
exports.scss = scss;
exports.splitJs = splitJs;
exports.pugStg = pugStg;
exports.pugLms = pugLms;