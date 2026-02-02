import * as fs from 'fs';
import * as path from 'path';

export const TEST_ENV_DIR = path.resolve('temp_test_env');

/**
 * Initializes a clean test environment directory.
 */
export function setupTestEnv() {
    if (!fs.existsSync(TEST_ENV_DIR)) {
        fs.mkdirSync(TEST_ENV_DIR, { recursive: true });
    }
}

/**
 * Creates a mock file with specified content.
 * @param filename relative path to the file within the test environment
 * @param content content to write
 */
export function createMockFile(filename: string, content: string = 'test content') {
    setupTestEnv();
    const filePath = path.join(TEST_ENV_DIR, filename);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content);
    return filePath;
}

/**
 * Cleans up the test environment.
 */
export function teardownTestEnv() {
    if (fs.existsSync(TEST_ENV_DIR)) {
        fs.rmSync(TEST_ENV_DIR, { recursive: true, force: true });
    }
}
