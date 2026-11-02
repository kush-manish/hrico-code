/** Run and submit code through the LeetCode judge. */
import * as v from '../validate.js';
import { runCode, submitCode } from '../leetcode.js';
import { judgeLimit, requireCap, validateBody, wrap } from '../middleware.js';

export function mount(app) {
  // ----------------------------------------------------------------- judge ---

  app.post('/api/run', judgeLimit, validateBody(b => ({
    slug: v.slug(b.slug),
    questionId: v.questionId(b.questionId),
    lang: v.lang(b.lang),
    code: v.code(b.code),
    dataInput: v.dataInput(b.dataInput),
  })), requireCap('leetcode'), wrap(async (req, res) => {
    res.json(await runCode(req.clean));
  }));

  app.post('/api/submit', judgeLimit, validateBody(b => ({
    slug: v.slug(b.slug),
    questionId: v.questionId(b.questionId),
    lang: v.lang(b.lang),
    code: v.code(b.code),
  })), requireCap('leetcode'), wrap(async (req, res) => {
    res.json(await submitCode(req.clean));
  }));

}
