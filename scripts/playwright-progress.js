import { reportTest } from "./progress.js";

export default class ProgressReporter {
  onTestEnd(test, result) {
    reportTest({ name: test.titlePath().join(" > "), status: result.status });
  }
}
