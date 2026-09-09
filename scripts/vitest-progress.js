import { reportTest } from "./progress.js";

export default class ProgressReporter {
  onTestCaseResult(test) {
    reportTest({ name: test.fullName, status: test.result().state });
  }
}
