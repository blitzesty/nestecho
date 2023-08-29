export interface ResponseError<Result = any, Data = any> {
    result: Result;
    data?: Data;
}
