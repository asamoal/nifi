/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import * as ErrorDetailActions from '../state/error/error.actions';
import { Action } from '@ngrx/store';
import { NiFiCommon } from './nifi-common.service';

@Injectable({ providedIn: 'root' })
export class ErrorHelper {
    constructor(private nifiCommon: NiFiCommon) {}

    fullScreenError(errorResponse: HttpErrorResponse): Action {
        let title: string;
        let message: string;

        switch (errorResponse.status) {
            case 401:
                title = 'Unauthorized';
                break;
            case 403:
                title = 'Insufficient Permissions';
                break;
            case 409:
                title = 'Invalid State';
                break;
            case 413:
                title = 'Payload Too Large';
                break;
            case 503:
            default:
                title = 'An unexpected error has occurred';
                break;
        }

        if (this.nifiCommon.isBlank(errorResponse.error)) {
            message =
                'An error occurred communicating with NiFi. Please check the logs and fix any configuration issues before restarting.';
        } else {
            message = errorResponse.error;
        }

        return ErrorDetailActions.fullScreenError({
            errorDetail: {
                title,
                message
            }
        });
    }

    showErrorInContext(status: number): boolean {
        return [400, 403, 404, 409, 413, 503].includes(status);
    }
}
