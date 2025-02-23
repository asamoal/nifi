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
import { Actions, concatLatestFrom, createEffect, ofType } from '@ngrx/effects';
import * as ControllerServicesActions from './controller-services.actions';
import { catchError, combineLatest, filter, from, map, NEVER, of, switchMap, take, takeUntil, tap } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { NiFiState } from '../../../../state';
import { selectControllerServiceTypes } from '../../../../state/extension-types/extension-types.selectors';
import { CreateControllerService } from '../../../../ui/common/controller-service/create-controller-service/create-controller-service.component';
import { Client } from '../../../../service/client.service';
import { YesNoDialog } from '../../../../ui/common/yes-no-dialog/yes-no-dialog.component';
import { EditControllerService } from '../../../../ui/common/controller-service/edit-controller-service/edit-controller-service.component';
import {
    ComponentType,
    ControllerServiceReferencingComponent,
    EditParameterRequest,
    EditParameterResponse,
    Parameter,
    ParameterEntity,
    UpdateControllerServiceRequest
} from '../../../../state/shared';
import { Router } from '@angular/router';
import { ExtensionTypesService } from '../../../../service/extension-types.service';
import { selectCurrentProcessGroupId, selectSaving } from './controller-services.selectors';
import { ControllerServiceService } from '../../service/controller-service.service';
import { selectCurrentParameterContext } from '../flow/flow.selectors';
import { FlowService } from '../../service/flow.service';
import { EditParameterDialog } from '../../../../ui/common/edit-parameter-dialog/edit-parameter-dialog.component';
import { selectParameterSaving } from '../parameter/parameter.selectors';
import * as ParameterActions from '../parameter/parameter.actions';
import { ParameterService } from '../../service/parameter.service';
import { EnableControllerService } from '../../../../ui/common/controller-service/enable-controller-service/enable-controller-service.component';
import { DisableControllerService } from '../../../../ui/common/controller-service/disable-controller-service/disable-controller-service.component';
import { PropertyTableHelperService } from '../../../../service/property-table-helper.service';

@Injectable()
export class ControllerServicesEffects {
    constructor(
        private actions$: Actions,
        private store: Store<NiFiState>,
        private client: Client,
        private controllerServiceService: ControllerServiceService,
        private flowService: FlowService,
        private parameterService: ParameterService,
        private extensionTypesService: ExtensionTypesService,
        private dialog: MatDialog,
        private router: Router,
        private propertyTableHelperService: PropertyTableHelperService
    ) {}

    loadControllerServices$ = createEffect(() =>
        this.actions$.pipe(
            ofType(ControllerServicesActions.loadControllerServices),
            map((action) => action.request),
            switchMap((request) =>
                combineLatest([
                    this.controllerServiceService.getControllerServices(request.processGroupId),
                    this.controllerServiceService.getBreadcrumbs(request.processGroupId)
                ]).pipe(
                    map(([controllerServicesResponse, breadcrumbsResponse]) =>
                        ControllerServicesActions.loadControllerServicesSuccess({
                            response: {
                                processGroupId: breadcrumbsResponse.id,
                                controllerServices: controllerServicesResponse.controllerServices,
                                loadedTimestamp: controllerServicesResponse.currentTime,
                                breadcrumb: breadcrumbsResponse
                            }
                        })
                    ),
                    catchError((error) =>
                        of(
                            ControllerServicesActions.controllerServicesApiError({
                                error: error.error
                            })
                        )
                    )
                )
            )
        )
    );

    openNewControllerServiceDialog$ = createEffect(
        () =>
            this.actions$.pipe(
                ofType(ControllerServicesActions.openNewControllerServiceDialog),
                concatLatestFrom(() => [
                    this.store.select(selectControllerServiceTypes),
                    this.store.select(selectCurrentProcessGroupId)
                ]),
                tap(([, controllerServiceTypes, processGroupId]) => {
                    const dialogReference = this.dialog.open(CreateControllerService, {
                        data: {
                            controllerServiceTypes
                        },
                        panelClass: 'medium-dialog'
                    });

                    dialogReference.componentInstance.saving$ = this.store.select(selectSaving);

                    dialogReference.componentInstance.createControllerService
                        .pipe(take(1))
                        .subscribe((controllerServiceType) => {
                            this.store.dispatch(
                                ControllerServicesActions.createControllerService({
                                    request: {
                                        revision: {
                                            clientId: this.client.getClientId(),
                                            version: 0
                                        },
                                        processGroupId,
                                        controllerServiceType: controllerServiceType.type,
                                        controllerServiceBundle: controllerServiceType.bundle
                                    }
                                })
                            );
                        });
                })
            ),
        { dispatch: false }
    );

    createControllerService$ = createEffect(() =>
        this.actions$.pipe(
            ofType(ControllerServicesActions.createControllerService),
            map((action) => action.request),
            switchMap((request) =>
                from(this.controllerServiceService.createControllerService(request)).pipe(
                    map((response) =>
                        ControllerServicesActions.createControllerServiceSuccess({
                            response: {
                                controllerService: response
                            }
                        })
                    ),
                    catchError((error) =>
                        of(
                            ControllerServicesActions.controllerServicesApiError({
                                error: error.error
                            })
                        )
                    )
                )
            )
        )
    );

    createControllerServiceSuccess$ = createEffect(
        () =>
            this.actions$.pipe(
                ofType(ControllerServicesActions.createControllerServiceSuccess),
                tap(() => {
                    this.dialog.closeAll();
                })
            ),
        { dispatch: false }
    );

    navigateToEditService$ = createEffect(
        () =>
            this.actions$.pipe(
                ofType(ControllerServicesActions.navigateToEditService),
                map((action) => action.id),
                concatLatestFrom(() => this.store.select(selectCurrentProcessGroupId)),
                tap(([id, processGroupId]) => {
                    this.router.navigate(['/process-groups', processGroupId, 'controller-services', id, 'edit']);
                })
            ),
        { dispatch: false }
    );

    openConfigureControllerServiceDialog$ = createEffect(
        () =>
            this.actions$.pipe(
                ofType(ControllerServicesActions.openConfigureControllerServiceDialog),
                map((action) => action.request),
                concatLatestFrom(() => [
                    this.store.select(selectCurrentParameterContext),
                    this.store.select(selectCurrentProcessGroupId)
                ]),
                tap(([request, parameterContext, processGroupId]) => {
                    const serviceId: string = request.id;

                    const editDialogReference = this.dialog.open(EditControllerService, {
                        data: {
                            controllerService: request.controllerService
                        },
                        id: serviceId,
                        panelClass: 'large-dialog'
                    });

                    editDialogReference.componentInstance.saving$ = this.store.select(selectSaving);

                    editDialogReference.componentInstance.createNewProperty =
                        this.propertyTableHelperService.createNewProperty(request.id, this.controllerServiceService);

                    const goTo = (commands: string[], destination: string): void => {
                        if (editDialogReference.componentInstance.editControllerServiceForm.dirty) {
                            const saveChangesDialogReference = this.dialog.open(YesNoDialog, {
                                data: {
                                    title: 'Controller Service Configuration',
                                    message: `Save changes before going to this ${destination}?`
                                },
                                panelClass: 'small-dialog'
                            });

                            saveChangesDialogReference.componentInstance.yes.pipe(take(1)).subscribe(() => {
                                editDialogReference.componentInstance.submitForm(commands);
                            });

                            saveChangesDialogReference.componentInstance.no.pipe(take(1)).subscribe(() => {
                                editDialogReference.close('ROUTED');
                                this.router.navigate(commands);
                            });
                        } else {
                            editDialogReference.close('ROUTED');
                            this.router.navigate(commands);
                        }
                    };

                    editDialogReference.componentInstance.goToReferencingComponent = (
                        component: ControllerServiceReferencingComponent
                    ) => {
                        const route: string[] = this.getRouteForReference(component);
                        goTo(route, component.referenceType);
                    };

                    if (parameterContext != null) {
                        editDialogReference.componentInstance.getParameters = (sensitive: boolean) => {
                            return this.flowService.getParameterContext(parameterContext.id).pipe(
                                take(1),
                                map((response) => response.component.parameters),
                                map((parameterEntities) => {
                                    return parameterEntities
                                        .map((parameterEntity: ParameterEntity) => parameterEntity.parameter)
                                        .filter((parameter: Parameter) => parameter.sensitive == sensitive);
                                })
                            );
                        };

                        editDialogReference.componentInstance.parameterContext = parameterContext;
                        editDialogReference.componentInstance.goToParameter = () => {
                            const commands: string[] = ['/parameter-contexts', parameterContext.id];
                            goTo(commands, 'Parameter');
                        };

                        editDialogReference.componentInstance.convertToParameter = (
                            name: string,
                            sensitive: boolean,
                            value: string | null
                        ) => {
                            return this.parameterService.getParameterContext(parameterContext.id, false).pipe(
                                switchMap((parameterContextEntity) => {
                                    const existingParameters: string[] =
                                        parameterContextEntity.component.parameters.map(
                                            (parameterEntity: ParameterEntity) => parameterEntity.parameter.name
                                        );
                                    const convertToParameterDialogRequest: EditParameterRequest = {
                                        parameter: {
                                            name,
                                            value,
                                            sensitive,
                                            description: ''
                                        },
                                        existingParameters
                                    };
                                    const convertToParameterDialogReference = this.dialog.open(EditParameterDialog, {
                                        data: convertToParameterDialogRequest,
                                        panelClass: 'medium-dialog'
                                    });

                                    convertToParameterDialogReference.componentInstance.saving$ =
                                        this.store.select(selectParameterSaving);

                                    convertToParameterDialogReference.componentInstance.cancel.pipe(
                                        takeUntil(convertToParameterDialogReference.afterClosed()),
                                        tap(() => ParameterActions.stopPollingParameterContextUpdateRequest())
                                    );

                                    return convertToParameterDialogReference.componentInstance.editParameter.pipe(
                                        takeUntil(convertToParameterDialogReference.afterClosed()),
                                        switchMap((dialogResponse: EditParameterResponse) => {
                                            this.store.dispatch(
                                                ParameterActions.submitParameterContextUpdateRequest({
                                                    request: {
                                                        id: parameterContext.id,
                                                        payload: {
                                                            revision: this.client.getRevision(parameterContextEntity),
                                                            component: {
                                                                id: parameterContextEntity.id,
                                                                parameters: [{ parameter: dialogResponse.parameter }]
                                                            }
                                                        }
                                                    }
                                                })
                                            );

                                            return this.store.select(selectParameterSaving).pipe(
                                                takeUntil(convertToParameterDialogReference.afterClosed()),
                                                filter((parameterSaving) => parameterSaving === false),
                                                map(() => {
                                                    convertToParameterDialogReference.close();
                                                    return `#{${dialogResponse.parameter.name}}`;
                                                })
                                            );
                                        })
                                    );
                                }),
                                catchError(() => {
                                    // TODO handle error
                                    return NEVER;
                                })
                            );
                        };
                    }

                    editDialogReference.componentInstance.goToService = (serviceId: string) => {
                        this.controllerServiceService.getControllerService(serviceId).subscribe({
                            next: (serviceEntity) => {
                                const commands: string[] = [
                                    '/process-groups',
                                    serviceEntity.component.parentGroupId,
                                    'controller-services',
                                    serviceEntity.id
                                ];
                                goTo(commands, 'Controller Service');
                            },
                            error: () => {
                                // TODO - handle error
                            }
                        });
                    };

                    editDialogReference.componentInstance.createNewService =
                        this.propertyTableHelperService.createNewService(
                            request.id,
                            this.controllerServiceService,
                            this.controllerServiceService,
                            processGroupId,
                            (createResponse) =>
                                this.store.dispatch(
                                    ControllerServicesActions.inlineCreateControllerServiceSuccess({
                                        response: {
                                            controllerService: createResponse
                                        }
                                    })
                                )
                        );

                    editDialogReference.componentInstance.editControllerService
                        .pipe(takeUntil(editDialogReference.afterClosed()))
                        .subscribe((updateControllerServiceRequest: UpdateControllerServiceRequest) => {
                            this.store.dispatch(
                                ControllerServicesActions.configureControllerService({
                                    request: {
                                        id: request.controllerService.id,
                                        uri: request.controllerService.uri,
                                        payload: updateControllerServiceRequest.payload,
                                        postUpdateNavigation: updateControllerServiceRequest.postUpdateNavigation
                                    }
                                })
                            );
                        });

                    editDialogReference.afterClosed().subscribe((response) => {
                        if (response != 'ROUTED') {
                            this.store.dispatch(
                                ControllerServicesActions.selectControllerService({
                                    request: {
                                        processGroupId,
                                        id: serviceId
                                    }
                                })
                            );
                        }
                    });
                })
            ),
        { dispatch: false }
    );

    configureControllerService$ = createEffect(() =>
        this.actions$.pipe(
            ofType(ControllerServicesActions.configureControllerService),
            map((action) => action.request),
            switchMap((request) =>
                from(this.controllerServiceService.updateControllerService(request)).pipe(
                    map((response) =>
                        ControllerServicesActions.configureControllerServiceSuccess({
                            response: {
                                id: request.id,
                                controllerService: response,
                                postUpdateNavigation: request.postUpdateNavigation
                            }
                        })
                    ),
                    catchError((error) =>
                        of(
                            ControllerServicesActions.controllerServicesApiError({
                                error: error.error
                            })
                        )
                    )
                )
            )
        )
    );

    configureControllerServiceSuccess$ = createEffect(
        () =>
            this.actions$.pipe(
                ofType(ControllerServicesActions.configureControllerServiceSuccess),
                map((action) => action.response),
                tap((response) => {
                    if (response.postUpdateNavigation) {
                        this.router.navigate(response.postUpdateNavigation);
                        this.dialog.getDialogById(response.id)?.close('ROUTED');
                    } else {
                        this.dialog.closeAll();
                    }
                })
            ),
        { dispatch: false }
    );

    openEnableControllerServiceDialog$ = createEffect(
        () =>
            this.actions$.pipe(
                ofType(ControllerServicesActions.openEnableControllerServiceDialog),
                map((action) => action.request),
                concatLatestFrom(() => this.store.select(selectCurrentProcessGroupId)),
                tap(([request, currentProcessGroupId]) => {
                    const serviceId: string = request.id;

                    const enableDialogReference = this.dialog.open(EnableControllerService, {
                        data: request,
                        id: serviceId,
                        panelClass: 'large-dialog'
                    });

                    enableDialogReference.componentInstance.goToReferencingComponent = (
                        component: ControllerServiceReferencingComponent
                    ) => {
                        enableDialogReference.close('ROUTED');

                        const route: string[] = this.getRouteForReference(component);
                        this.router.navigate(route);
                    };

                    enableDialogReference.afterClosed().subscribe((response) => {
                        if (response != 'ROUTED') {
                            this.store.dispatch(
                                ControllerServicesActions.loadControllerServices({
                                    request: {
                                        processGroupId: currentProcessGroupId
                                    }
                                })
                            );
                        }
                    });
                })
            ),
        { dispatch: false }
    );

    openDisableControllerServiceDialog$ = createEffect(
        () =>
            this.actions$.pipe(
                ofType(ControllerServicesActions.openDisableControllerServiceDialog),
                map((action) => action.request),
                concatLatestFrom(() => this.store.select(selectCurrentProcessGroupId)),
                tap(([request, currentProcessGroupId]) => {
                    const serviceId: string = request.id;

                    const enableDialogReference = this.dialog.open(DisableControllerService, {
                        data: request,
                        id: serviceId,
                        panelClass: 'large-dialog'
                    });

                    enableDialogReference.componentInstance.goToReferencingComponent = (
                        component: ControllerServiceReferencingComponent
                    ) => {
                        enableDialogReference.close('ROUTED');

                        const route: string[] = this.getRouteForReference(component);
                        this.router.navigate(route);
                    };

                    enableDialogReference.afterClosed().subscribe((response) => {
                        if (response != 'ROUTED') {
                            this.store.dispatch(
                                ControllerServicesActions.loadControllerServices({
                                    request: {
                                        processGroupId: currentProcessGroupId
                                    }
                                })
                            );
                        }
                    });
                })
            ),
        { dispatch: false }
    );

    promptControllerServiceDeletion$ = createEffect(
        () =>
            this.actions$.pipe(
                ofType(ControllerServicesActions.promptControllerServiceDeletion),
                map((action) => action.request),
                tap((request) => {
                    const dialogReference = this.dialog.open(YesNoDialog, {
                        data: {
                            title: 'Delete Controller Service',
                            message: `Delete controller service ${request.controllerService.component.name}?`
                        },
                        panelClass: 'small-dialog'
                    });

                    dialogReference.componentInstance.yes.pipe(take(1)).subscribe(() => {
                        this.store.dispatch(
                            ControllerServicesActions.deleteControllerService({
                                request
                            })
                        );
                    });
                })
            ),
        { dispatch: false }
    );

    deleteControllerService$ = createEffect(() =>
        this.actions$.pipe(
            ofType(ControllerServicesActions.deleteControllerService),
            map((action) => action.request),
            switchMap((request) =>
                from(this.controllerServiceService.deleteControllerService(request)).pipe(
                    map((response) =>
                        ControllerServicesActions.deleteControllerServiceSuccess({
                            response: {
                                controllerService: response
                            }
                        })
                    ),
                    catchError((error) =>
                        of(
                            ControllerServicesActions.controllerServicesApiError({
                                error: error.error
                            })
                        )
                    )
                )
            )
        )
    );

    selectControllerService$ = createEffect(
        () =>
            this.actions$.pipe(
                ofType(ControllerServicesActions.selectControllerService),
                map((action) => action.request),
                tap((request) => {
                    this.router.navigate([
                        '/process-groups',
                        request.processGroupId,
                        'controller-services',
                        request.id
                    ]);
                })
            ),
        { dispatch: false }
    );

    private getRouteForReference(reference: ControllerServiceReferencingComponent): string[] {
        if (reference.referenceType == 'ControllerService') {
            if (reference.groupId == null) {
                return ['/settings', 'management-controller-services', reference.id];
            } else {
                return ['/process-groups', reference.groupId, 'controller-services', reference.id];
            }
        } else if (reference.referenceType == 'ReportingTask') {
            return ['/settings', 'reporting-tasks', reference.id];
        } else if (reference.referenceType == 'Processor') {
            return ['/process-groups', reference.groupId, ComponentType.Processor, reference.id];
        } else if (reference.referenceType == 'FlowAnalysisRule') {
            return ['/settings', 'flow-analysis-rules', reference.id];
        } else if (reference.referenceType == 'ParameterProvider') {
            return ['/settings', 'parameter-providers', reference.id];
        } else {
            return ['/settings', 'registry-clients', reference.id];
        }
    }
}
