export interface ResponseError<Result = any, Information = any> {
    result: Result;
    information?: Information;
}
