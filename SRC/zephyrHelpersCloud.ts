/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable no-console */
import request from 'supertest';
import { expect, assert } from 'chai';
import { ZephyrConfig } from './interfaces/zephyr-config.interface';
import { defaultVariables, Variables } from './interfaces/variables.interface';
import { Project } from './interfaces/project.interface';
import { Environment } from './interfaces/environment.interface';
import { TestCase } from './interfaces/testcases.interface';
import { TestResultDetails } from './interfaces/test-result-details.interface';
import { TestResultBody } from './interfaces/update-test-result-body.interface';
import { SoftAssert } from './interfaces/soft-assert.interface';
import { JiraAccount } from './interfaces/jiraAccount.interface';
import { Response } from './interfaces/response.interface';
import { NewTestResult } from './interfaces/new-test-result.interface';

/**
 * This function checks the value of all the keys in an object, if the value is **undefined** an error is logged.
 * @param {object} obj the object to check
 * @param {string} msg the name of the function calling this (used for error logging)
 */
const validateObjectValues = (obj: { [key: string]: any }, msg: string) => {
  const paramsUndefined = Object.values(obj).includes(undefined);

  if (paramsUndefined) {
    console.log(obj);
    throw new Error(
      `ERROR: [${msg}] one, or more, parameter(s) value is UNDEFINED`
    );
  }
};

const variables: Variables = defaultVariables;

/**
 * This function sets a range of variables the Zephyr module uses
 * @param {ZephyrConfig} zephyrConfig
 */
export async function init(zephyrConfig: ZephyrConfig) {
  validateObjectValues(zephyrConfig, 'init');
  variables.zephyrURL = zephyrConfig.zephyrURL;
  variables.jiraURL = zephyrConfig.jiraURL;
  variables.folderName = zephyrConfig.zephyrFolderName;
  variables.zephyrApiToken = zephyrConfig.zephyrApiToken;
  variables.jiraApiToken = zephyrConfig.jiraApiToken;
  variables.environment = zephyrConfig.environment;
  variables.projectKey = zephyrConfig.zephyrProjectKey;
  variables.defaultJiraDisplayName = zephyrConfig.defaultJiraDisplayName;
  variables.jiraDisplayName = zephyrConfig.jiraDisplayName;
}



const getJiraAccounts = async () => {
  let accounts;
  await request(variables.jiraURL)
    .get(`/rest/api/2/user/search?query&maxResults=2000`)
    .set('Authorization', `Basic ${variables.jiraApiToken}`)
    .then((res) => {
      accounts = res.body;
    });
  return accounts;
};

export const getJiraAccountId = async (): Promise<string> => {
  //TODO wat als de displayName niet gevonden is?
  const allAccounts: JiraAccount[] = await getJiraAccounts(); // return de value van de key 'accountId' voor elke folder waar de value van de key 'displayName' gelijk is aan de naam die we zoeken
  return allAccounts.find((account) => account.displayName === variables.jiraDisplayName)
    .accountId;
};

const getEnvironmentNames = async (): Promise<Environment> => {
  let environmentNames;
  await request(variables.zephyrURL)
    .get(`/environments?projectKey=${variables.projectKey}`)
    .set('Authorization', `Bearer ${variables.zephyrApiToken}`)
    .then((res) => {
      environmentNames = JSON.parse(res.text);
    });
  return environmentNames;
};

const logEnvironmentNames = async () => {
  const allEnvironments: Environment = await getEnvironmentNames();
  allEnvironments.values.forEach((environment: Environment) =>
    console.log(`Available environment: ${environment.name}`)
  );
};




/**
 * This function will get all testcases for a certain project and add them to variables.testCasesArray
 * @returns {void}
 */
export const getAllTestcases = async (): Promise<void> => {
  await request(variables.url)
    .get(`/rest/tests/1.0/project/${variables.projectId}/testcases`)
    .auth(variables.username, variables.password)
    .expect(200)
    .then((res: any) => {
      variables.testCasesArray = res.body.testCases;
    });
};

const filterTestcase = async (
  testcaseFolderName: string,
  testcaseName: string
): Promise<TestCase> => {
  const filteredTestcase: TestCase = variables.testCasesArray.find(
    (testcase: TestCase) =>
      testcaseFolderName === testcase.folder?.name &&
      testcaseName === testcase.name
  );
  if (filteredTestcase === undefined) {
    console.log(
      `ERROR: [filterTestcase] No testcase found with name: ${testcaseName}, in folder: ${testcaseFolderName}`
    );
    process.exit(1);
  }
  return filteredTestcase;
};

/**
 * Creating the test result 'entry' in the test run context.
 * @param {*} testcaseId
 * @returns
 */
const createTestResult = async (testcaseId: number): Promise<number> => {
  let testrun: Response<NewTestResult>;

  const testrunPayload = {
    testCaseId: testcaseId,
    assignedTo: variables.jiraUserId,
    environmentId: variables.envId,
  };

  const jsonTestRunPayload = JSON.stringify(testrunPayload);

  await request(variables.url)
    .post('/rest/tests/1.0/testresult')
    .set('content-Length', Buffer.byteLength(jsonTestRunPayload).toString())
    .set('content-Type', 'application/json;charset=UTF-8')
    .set('jira-project-id', variables.projectId)
    .auth(variables.username, variables.password)
    .send(jsonTestRunPayload)
    .then((res: any) => {
      expect(res.statusCode).eq(201);
      testrun = res;
    });

  return testrun.body.id;
};

/**
 * Updating the test result 'entry' with the passed/failed status, based on the 'test run id'
 * @param {object} params  testrunId, status (passed or failed)
 */
export const updateTestResult = async (
  testResultDetails: TestResultDetails
) => {
  const { testRunId, testStatus } = testResultDetails;
  const now = new Date();
  const jsonDate = now.toJSON();
  let status;

  validateObjectValues(testResultDetails, 'updateTestResult');

  switch (testStatus) {
    case true:
      status = 10166; // todo hardcoded: need method for these
      break;
    case false:
      status = 10167;
      console.log('> WARNING: test restult status = "failed"');
      break;
    default:
      status = 10167;
      console.log('> WARNING: test restult status = "default(failed)"');
      break;
  }

  const payload: TestResultBody[] = [
    {
      id: testRunId,
      testResultStatusId: status,
      userKey: variables.jiraUserId,
      executionDate: jsonDate,
      actualStartDate: jsonDate,
    },
  ];

  const jsonPayload: string = JSON.stringify(payload);

  await request(variables.url)
    .put('/rest/tests/1.0/testresult')
    .auth(variables.username, variables.password)
    .set('content-Length', Buffer.byteLength(jsonPayload).toString())
    .set('content-Type', 'application/json;charset=UTF-8')
    .set('jira-project-id', variables.projectId)
    .send(jsonPayload)
    .then((res: any) => {
      expect(res.statusCode).eq(200);
    });
};

/**
 * This function creates a new test run and resturns the testrun ID
 * @param {string} testcaseFolderName name of the folder the testcase is in
 * @param {string} testcaseName name of the testcase
 * @returns {number} testrun ID
 */
export const createNewTestrun = async (
  testcaseFolderName: string,
  testcaseName: string
): Promise<number> => {
  // searching for the correct test case (using the test name and folder name).
  const filteredTestcase: TestCase = await filterTestcase(
    testcaseFolderName,
    testcaseName
  );

  // create test run & collect testrun ID.
  const testrunId: number = await createTestResult(filteredTestcase.id);
  return testrunId;
};

/**
 * Assert and capture errors.
 * While a normal failing assert would stop the code from running, the soft-assert can continue
 * And throws errors only if .assertAll() is called.
 */
export const softAssert: SoftAssert = {
  failedAsserts: [],
  equals(value: any, condition: any): boolean {
    if (value === undefined || condition === undefined) {
      console.log(
        'ERROR [equals] please provide the value and condition arguments'
      );
      process.exit(1);
    }
    let assertPassed = false;
    try {
      expect(value).equal(condition);
      assertPassed = true;
    } catch (error) {
      const e: any = error;
      this.failedAsserts.push(e);
    }
    return assertPassed;
  },
  notEquals(value: any, condition: any): boolean {
    if (value === undefined || condition === undefined) {
      console.log(
        'ERROR [notEquals] please provide the value and condition arguments'
      );
      process.exit(1);
    }
    let assertPassed = false;
    try {
      expect(value).not.equal(condition);
      assertPassed = true;
    } catch (error) {
      const e: any = error;
      this.failedAsserts.push(e);
    }
    return assertPassed;
  },
  deepEquals(value: any, condition: any): boolean {
    if (value === undefined || condition === undefined) {
      console.log(
        'ERROR [deepEquals] please provide the value and condition arguments'
      );
      process.exit(1);
    }
    let assertPassed = false;
    try {
      expect(value).deep.equal(condition);
      assertPassed = true;
    } catch (error) {
      const e: any = error;
      this.failedAsserts.push(e);
    }
    return assertPassed;
  },
  includes(sample: any, pattern: any): boolean {
    if (sample === undefined || pattern === undefined) {
      console.log(
        'ERROR [includes] please provide the sample and pattern arguments'
      );
      process.exit(1);
    }
    let assertPassed = false;
    if (Array.isArray(sample) === true && Array.isArray(pattern) === true) {
      console.log('sample is object or array');
      try {
        expect(sample).include.members(pattern);
        assertPassed = true;
      } catch (error) {
        const e: any = error;
        this.failedAsserts.push(e);
      }
    } else {
      try {
        expect(sample).deep.include(pattern);
        assertPassed = true;
      } catch (error) {
        const e: any = error;
        this.failedAsserts.push(e);
      }
    }
    return assertPassed;
  },
  notIncludes(sample: any, pattern: any): boolean {
    if (sample === undefined || pattern === undefined) {
      console.log(
        'ERROR [notIncludes] please provide the sample and pattern arguments'
      );
      process.exit(1);
    }
    let assertPassed = false;
    if (Array.isArray(sample) === true && Array.isArray(pattern) === true) {
      console.log('sample is object or array');
      try {
        expect(sample).not.include.members(pattern);
        assertPassed = true;
      } catch (error) {
        const e: any = error;
        this.failedAsserts.push(e);
      }
    } else {
      try {
        expect(sample).not.deep.include(pattern);
        assertPassed = true;
      } catch (error) {
        const e: any = error;
        this.failedAsserts.push(e);
      }
    }
    return assertPassed;
  },
  isUndefined(value: any): boolean {
    let assertPassed = false;
    try {
      expect(value).equal(undefined);
      assertPassed = true;
    } catch (error) {
      const e: any = error;
      this.failedAsserts.push(e);
    }
    return assertPassed;
  },
  isNull(value: any): boolean {
    let assertPassed = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(value).to.be.null;
      assertPassed = true;
    } catch (error) {
      const e: any = error;
      this.failedAsserts.push(e);
    }
    return assertPassed;
  },
  /**
   * @param {object} params object & array
   * @returns true or false
   */
  objectHasAllKeys(
    obj: { [key: string]: any },
    arrayWithKeys: string[]
  ): boolean {
    if (!obj || !arrayWithKeys) {
      console.log(
        'ERROR [objectHasAllKeys] please provide the sample and pattern arguments'
      );
      process.exit(1);
    }
    if (Array.isArray(arrayWithKeys) !== true) {
      console.log('please pass an array as the arguments for "arrayWithKeys"');
      process.exit(1);
    }
    if (typeof obj !== 'object' || Array.isArray(obj) === true) {
      console.log(
        'ERROR: [objectHasAllKeys] argument type of argument "obj" is not an object'
      );
      process.exit(1);
    }
    let assertPassed;
    try {
      expect(obj).to.have.all.keys(arrayWithKeys);
      assertPassed = true;
    } catch (error) {
      const e: any = error;
      this.failedAsserts.push(e);
      assertPassed = false;
    }
    return assertPassed;
  },
  isEmptyObject(obj: { [key: string]: any }): boolean {
    let assertPassed = false;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) === true) {
      console.log('WARNING [isEmptyObject] "obj" argument is not an object!');
    }
    try {
      expect(Object.keys(obj)).lengthOf(0);
      assertPassed = true;
    } catch (error) {
      const e: any = error;
      this.failedAsserts.push(e);
    }
    return assertPassed;
  },
  /**
   * Usefull to check e.g. if a propterty in an object has a value
   */
  hasLength(value: any): boolean {
    let assertPassed = false;
    if (!value) {
      console.log('ERROR [hasLength] please pass an argument');
      process.exit(1);
    }
    if (typeof value === 'string' || typeof value === 'object') {
      try {
        expect(value).not.be.empty;
        assertPassed = true;
      } catch (error) {
        const e: any = error;
        this.failedAsserts.push(e);
      }
    }
    if (typeof value === 'number') {
      try {
        expect(value).not.be.null;
      } catch (error) {
        const e: any = error;
        this.failedAsserts.push(e);
        assertPassed = false;
      }
    }
    return assertPassed;
  },
  isOneOf(arr: [], value: any): boolean {
    let assertPassed = false;
    if (!value) {
      console.log('ERROR [isOneOf] please pass an argument');
      process.exit(1);
    }
    try {
      expect(value).to.be.oneOf(arr);
      assertPassed = true;
    } catch (error) {
      const e: any = error;
      this.failedAsserts.push(e);
    }
    return assertPassed;
  },
  /**
   * Use this function at the end of a test to check if any of the soft-asserts failed.
   * Thow an assert.fail if any errors were captured.
   */
  assertAll: async function assertAll(): Promise<void> {
    if (this.failedAsserts.length > 0) {
      const copyOfFailedAsserts: string[] = [...this.failedAsserts];
      this.failedAsserts.length = 0;
      assert.fail(copyOfFailedAsserts.join(', \n'));
    }
  },
};
