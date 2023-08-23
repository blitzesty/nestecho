import { minimatch } from 'minimatch';

export function matchOnce(patterns: string[] = [], value = '') {
    for (const pattern of patterns) {
        if (minimatch(value, pattern)) {
            return true;
        }
    }
    return false;
}
