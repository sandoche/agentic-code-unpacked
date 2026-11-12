// Generated from packages/presentations/walkthrough/src/assets/walkthrough.mts. Edit that source, then run pnpm skills:build.
function required(value) {
    if (value === undefined || value === null)
        throw Error('Missing walkthrough element');
    return value;
}
const steps = [...document.querySelectorAll('.step')];
const chapters = [...document.querySelectorAll('[data-chapter]')];
const chapterStarts = [...document.querySelectorAll('[data-chapter-start]')];
const previous = required(document.querySelector('button#previous'));
const next = required(document.querySelector('button#next'));
const play = required(document.querySelector('button#play'));
const position = required(document.querySelector('#position'));
let active = 0;
let playing = false;
let timer;
const isVideo = new URLSearchParams(location.search).get('video') === '1';
if (isVideo) {
    document.documentElement.dataset.video = 'true';
    document.querySelectorAll('details.step-evidence').forEach(details => { details.open = true; });
}
function pause() {
    playing = false;
    window.clearTimeout(timer);
    play.textContent = 'Play';
    play.setAttribute('aria-label', 'Play walkthrough');
    play.setAttribute('aria-pressed', 'false');
}
function schedule() {
    window.clearTimeout(timer);
    if (!playing)
        return;
    timer = window.setTimeout(() => {
        if (active === steps.length - 1)
            pause();
        else {
            showStep(active + 1);
            schedule();
        }
    }, Number(required(steps[active]).dataset.duration) * 1000);
}
function showStep(index) {
    active = Math.max(0, Math.min(steps.length - 1, index));
    steps.forEach((step, i) => { step.hidden = i !== active; });
    chapters.forEach((chapter, i) => {
        if (i === active)
            chapter.setAttribute('aria-current', 'step');
        else
            chapter.removeAttribute('aria-current');
    });
    chapterStarts.forEach(button => {
        const start = Number(button.dataset.chapterStart);
        button.setAttribute('aria-pressed', String(required(steps[start]).dataset.chapterId === required(steps[active]).dataset.chapterId));
    });
    previous.disabled = active === 0;
    next.disabled = active === steps.length - 1;
    position.textContent = `${active + 1} / ${steps.length}`;
    required(document.querySelector('.progress-fill')).style.width = `${(active + 1) / steps.length * 100}%`;
    const step = required(steps[active]);
    const boundary = step.getBoundingClientRect();
    const overflow = step.scrollHeight > step.clientHeight + 2 || [...step.querySelectorAll('h2,.explanation,pre,.sources')].some(element => element.getBoundingClientRect().bottom > boundary.bottom + 2 || element.scrollWidth > element.clientWidth + 2);
    if (playing)
        schedule();
    return { id: step.dataset.id, index: active, overflow };
}
function move(index) { pause(); showStep(index); }
previous.addEventListener('click', () => move(active - 1));
next.addEventListener('click', () => move(active + 1));
chapters.forEach((chapter, i) => chapter.addEventListener('click', () => move(i)));
chapterStarts.forEach(button => button.addEventListener('click', () => move(Number(button.dataset.chapterStart))));
play.addEventListener('click', () => {
    if (playing) {
        pause();
        return;
    }
    if (active === steps.length - 1)
        showStep(0);
    playing = true;
    play.textContent = 'Pause';
    play.setAttribute('aria-label', 'Pause walkthrough');
    play.setAttribute('aria-pressed', 'true');
    schedule();
});
document.addEventListener('keydown', event => {
    const tag = event.target instanceof Element ? event.target.tagName : '';
    if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(tag))
        return;
    if (event.key === 'ArrowRight') {
        event.preventDefault();
        move(active + 1);
    }
    if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move(active - 1);
    }
    if (event.key === 'Home') {
        event.preventDefault();
        move(0);
    }
    if (event.key === 'End') {
        event.preventDefault();
        move(steps.length - 1);
    }
    if (event.code === 'Space' && tag !== 'BUTTON') {
        event.preventDefault();
        play.click();
    }
});
window.walkthroughPresentation = { showStep, pause, get activeStep() { return active; } };
showStep(0);
export {};
