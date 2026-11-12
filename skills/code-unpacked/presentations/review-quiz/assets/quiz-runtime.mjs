// Generated from packages/presentations/review-quiz/src/assets/quiz-runtime.mts. Edit that source, then run pnpm skills:build.
function required(value) {
    if (value === undefined || value === null)
        throw Error('Missing quiz element or evidence');
    return value;
}
export function gradeQuiz(quiz, answers = {}) {
    const recommendations = new Map();
    const questions = quiz.questions.map((question, index) => {
        const answerId = Object.hasOwn(answers, question.id) ? answers[question.id] : null;
        const status = answerId === null || answerId === undefined || answerId === ''
            ? 'unanswered'
            : answerId === question.correctOptionId ? 'correct' : 'incorrect';
        if (status !== 'correct') {
            const evidence = [...new Set(question.evidence)].sort();
            const key = JSON.stringify([question.topic, evidence]);
            if (!recommendations.has(key))
                recommendations.set(key, {
                    topic: question.topic, checks: [], evidence, questionIds: [], missed: 0, order: index,
                });
            const recommendation = required(recommendations.get(key));
            if (!recommendation.checks.includes(question.recommendation))
                recommendation.checks.push(question.recommendation);
            recommendation.questionIds.push(question.id);
            recommendation.missed++;
        }
        return { questionId: question.id, answerId: answerId ?? null, status };
    });
    const correct = questions.filter(question => question.status === 'correct').length;
    const unanswered = questions.filter(question => question.status === 'unanswered').length;
    return {
        total: questions.length, correct, unanswered,
        incorrect: questions.length - correct - unanswered,
        score: questions.length ? Math.round(100 * correct / questions.length) : 0,
        questions,
        recommendations: [...recommendations.values()]
            .sort((a, b) => b.missed - a.missed || a.order - b.order)
            .map(({ order: _order, ...recommendation }) => recommendation),
    };
}
export function mountQuiz(payload, document = globalThis.document) {
    const { quiz, evidence } = payload;
    const form = required(document.querySelector('form#quiz-form'));
    const fieldsets = [...form.querySelectorAll('fieldset')];
    const progress = required(document.getElementById('answer-progress'));
    const results = required(document.getElementById('results'));
    const recommendations = required(document.getElementById('recommendations'));
    const collectAnswers = () => Object.fromEntries(quiz.questions.flatMap((question, index) => {
        const checked = required(fieldsets[index]).querySelector('input:checked');
        return checked ? [[question.id, checked.value]] : [];
    }));
    const updateProgress = () => {
        progress.textContent = `${Object.keys(collectAnswers()).length} of ${quiz.questions.length} answered`;
    };
    const clearResults = () => {
        results.hidden = true;
        for (const fieldset of fieldsets) {
            required(fieldset.querySelector('.feedback')).hidden = true;
            fieldset.removeAttribute('data-result');
        }
    };
    const sourceNode = (id) => {
        const source = required(evidence[id]);
        const node = document.createElement(source.url ? 'a' : 'span');
        node.textContent = `${source.path}:${source.startLine}–${source.endLine}${source.url ? '' : ' (local snapshot)'}`;
        if (source.url && node instanceof HTMLAnchorElement) {
            node.href = source.url;
            node.target = '_blank';
            node.rel = 'noreferrer';
        }
        return node;
    };
    form.addEventListener('change', () => { clearResults(); updateProgress(); });
    form.addEventListener('reset', () => {
        clearResults();
        // A reset event fires before the browser restores default input values.
        progress.textContent = `0 of ${quiz.questions.length} answered`;
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        const grade = gradeQuiz(quiz, collectAnswers());
        required(document.getElementById('score')).textContent = `${grade.score}%`;
        required(document.getElementById('score-detail')).textContent = `${grade.correct} correct · ${grade.incorrect} incorrect · ${grade.unanswered} unanswered · ${grade.total} questions`;
        grade.questions.forEach((answer, index) => {
            const fieldset = required(fieldsets[index]);
            fieldset.dataset.result = answer.status;
            const feedback = required(fieldset.querySelector('.feedback'));
            feedback.hidden = false;
            required(feedback.querySelector('.answer-status')).textContent = answer.status === 'correct' ? 'Correct' : answer.status === 'incorrect' ? 'Incorrect' : 'Unanswered';
        });
        recommendations.replaceChildren();
        if (!grade.recommendations.length) {
            const item = document.createElement('li');
            item.textContent = 'All answers are correct. Revisit the coverage and limitations below before continuing your review.';
            recommendations.append(item);
        }
        for (const recommendation of grade.recommendations) {
            const item = document.createElement('li');
            const heading = document.createElement('strong');
            heading.textContent = `${recommendation.topic} · ${recommendation.missed} question${recommendation.missed === 1 ? '' : 's'} to revisit`;
            item.append(heading);
            for (const check of recommendation.checks) {
                const paragraph = document.createElement('p');
                paragraph.textContent = check;
                item.append(paragraph);
            }
            const sources = document.createElement('p');
            sources.className = 'sources';
            recommendation.evidence.forEach((id, index) => {
                if (index)
                    sources.append(document.createTextNode(' · '));
                sources.append(sourceNode(id));
            });
            item.append(sources);
            recommendations.append(item);
        }
        results.hidden = false;
        results.focus();
    });
    form.reset();
    updateProgress();
}
