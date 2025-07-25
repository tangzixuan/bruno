import React, { useRef, useEffect, useCallback, forwardRef, useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import toast from 'react-hot-toast';
import path from 'utils/common/path';
import { uuid } from 'utils/common';
import Modal from 'components/Modal';
import { useDispatch, useSelector } from 'react-redux';
import { newEphemeralHttpRequest } from 'providers/ReduxStore/slices/collections';
import { newHttpRequest } from 'providers/ReduxStore/slices/collections/actions';
import { addTab } from 'providers/ReduxStore/slices/tabs';
import HttpMethodSelector from 'components/RequestPane/QueryUrl/HttpMethodSelector';
import { getDefaultRequestPaneTab } from 'utils/collections';
import { getRequestFromCurlCommand } from 'utils/curl';
import { IconArrowBackUp, IconCaretDown, IconEdit } from '@tabler/icons';
import { sanitizeName, validateName, validateNameError } from 'utils/common/regex';
import Dropdown from 'components/Dropdown';
import PathDisplay from 'components/PathDisplay';
import Portal from 'components/Portal';
import Help from 'components/Help';
import StyledWrapper from './StyledWrapper';
import SingleLineEditor from 'components/SingleLineEditor/index';
import { useTheme } from 'styled-components';

const NewRequest = ({ collectionUid, item, isEphemeral, onClose }) => {
  const dispatch = useDispatch();
  const inputRef = useRef();

  const storedTheme = useTheme();

  const collection = useSelector(state => state.collections.collections?.find(c => c.uid === collectionUid));
  const {
    brunoConfig: { presets: collectionPresets = {} }
  } = collection;
  const [curlRequestTypeDetected, setCurlRequestTypeDetected] = useState(null);
  const [showFilesystemName, toggleShowFilesystemName] = useState(false);

  const dropdownTippyRef = useRef();
  const onDropdownCreate = (ref) => (dropdownTippyRef.current = ref);

  const advancedDropdownTippyRef = useRef();
  const onAdvancedDropdownCreate = (ref) => (advancedDropdownTippyRef.current = ref);

  const Icon = forwardRef((props, ref) => {
    return (
      <div ref={ref} className="flex items-center justify-end auth-type-label select-none">
        {curlRequestTypeDetected === 'http-request' ? "HTTP" : "GraphQL"}
        <IconCaretDown className="caret ml-1 mr-1" size={14} strokeWidth={2} />
      </div>
    );
  });

  // This function analyzes a given cURL command string and determines whether the request is a GraphQL or HTTP request.
  const identifyCurlRequestType = (url, headers, body) => {
    if (url.endsWith('/graphql')) {
      setCurlRequestTypeDetected('graphql-request');
      return;
    }

    const contentType = headers?.find((h) => h.name.toLowerCase() === 'content-type')?.value;
    if (contentType && contentType.includes('application/graphql')) {
      setCurlRequestTypeDetected('graphql-request');
      return;
    }

    setCurlRequestTypeDetected('http-request');
  };

  const curlRequestTypeChange = (type) => {
    setCurlRequestTypeDetected(type);
  };

  const [isEditing, toggleEditing] = useState(false);

  const getRequestType = (collectionPresets) => {
    if (!collectionPresets || !collectionPresets.requestType) {
      return 'http-request';
    }

    // Note: Why different labels for the same thing?
    // http-request and graphql-request are used inside the app's json representation of a request
    // http and graphql are used in Bru DSL as well as collection exports
    // We need to eventually standardize the app's DSL to use the same labels as bru DSL
    if (collectionPresets.requestType === 'http') {
      return 'http-request';
    }

    if (collectionPresets.requestType === 'graphql') {
      return 'graphql-request';
    }

    return 'http-request';
  };

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      requestName: '',
      filename: '',
      requestType: getRequestType(collectionPresets),
      requestUrl: collectionPresets.requestUrl || '',
      requestMethod: 'GET',
      curlCommand: ''
    },
    validationSchema: Yup.object({
      requestName: Yup.string()
        .trim()
        .min(1, 'must be at least 1 character')
        .max(255, 'must be 255 characters or less')
        .required('name is required'),
      filename: Yup.string()
        .trim()
        .min(1, 'must be at least 1 character')
        .max(255, 'must be 255 characters or less')
        .required('filename is required')
        .test('is-valid-filename', function(value) {
          const isValid = validateName(value);
          return isValid ? true : this.createError({ message: validateNameError(value) });
        })
        .test('not-reserved', `The file names "collection" and "folder" are reserved in bruno`, value => !['collection', 'folder'].includes(value)),
      curlCommand: Yup.string().when('requestType', {
        is: (requestType) => requestType === 'from-curl',
        then: Yup.string()
          .min(1, 'must be at least 1 character')
          .required('curlCommand is required')
          .test({
            name: 'curlCommand',
            message: `Invalid cURL Command`,
            test: (value) => getRequestFromCurlCommand(value) !== null
          })
      })
    }),
    onSubmit: (values) => {
      if (isEphemeral) {
        const uid = uuid();
        dispatch(
          newEphemeralHttpRequest({
            uid: uid,
            requestName: values.requestName,
            filename: values.filename,
            requestType: values.requestType,
            requestUrl: values.requestUrl,
            requestMethod: values.requestMethod,
            collectionUid: collectionUid
          })
        )
          .then(() => {
            dispatch(
              addTab({
                uid: uid,
                collectionUid: collectionUid,
                requestPaneTab: getDefaultRequestPaneTab({ type: values.requestType })
              })
            );
            onClose();
          })
          .catch((err) => toast.error(err ? err.message : 'An error occurred while adding the request'));
      } else if (values.requestType === 'from-curl') {
        const request = getRequestFromCurlCommand(values.curlCommand, curlRequestTypeDetected);
        const settings = { encodeUrl: false };

        dispatch(
          newHttpRequest({
            requestName: values.requestName,
            filename: values.filename,
            requestType: curlRequestTypeDetected,
            requestUrl: request.url,
            requestMethod: request.method,
            collectionUid: collectionUid,
            itemUid: item ? item.uid : null,
            headers: request.headers,
            body: request.body,
            auth: request.auth,
            settings: settings
          })
        )
          .then(() => {
            toast.success('New request created!');
            onClose()
          })
          .catch((err) => toast.error(err ? err.message : 'An error occurred while adding the request'));
      } else {
        dispatch(
          newHttpRequest({
            requestName: values.requestName,
            filename: values.filename,
            requestType: values.requestType,
            requestUrl: values.requestUrl,
            requestMethod: values.requestMethod,
            collectionUid: collectionUid,
            itemUid: item ? item.uid : null
          })
        )
          .then(() => {
            toast.success('New request created!');
            onClose()
          })
          .catch((err) => toast.error(err ? err.message : 'An error occurred while adding the request'));
      }
    }
  });

  useEffect(() => {
    if (inputRef && inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputRef]);

  const onSubmit = () => formik.handleSubmit();

  const handlePaste = useCallback(
    (event) => {
      const clipboardData = event.clipboardData || window.clipboardData;
      const pastedData = clipboardData.getData('Text');

      // Check if pasted data looks like a cURL command
      const curlCommandRegex = /^\s*curl\s/i;
      if (curlCommandRegex.test(pastedData)) {
        // Switch to the 'from-curl' request type
        formik.setFieldValue('requestType', 'from-curl');
        formik.setFieldValue('curlCommand', pastedData);

        // Identify the request type
        const request = getRequestFromCurlCommand(pastedData);
        if (request) {
          identifyCurlRequestType(request.url, request.headers, request.body);
        }

        // Prevent the default paste behavior to avoid pasting into the textarea
        event.preventDefault();
      }
    },
    [formik]
  );

  const handleCurlCommandChange = (event) => {
    formik.handleChange(event);

    if (event.target.name === 'curlCommand') {
      const curlCommand = event.target.value;
      const request = getRequestFromCurlCommand(curlCommand);
      if (request) {
        identifyCurlRequestType(request.url, request.headers, request.body);
      }
    }
  };

  const AdvancedOptions = forwardRef((props, ref) => {
    return (
      <div ref={ref} className="flex mr-2 text-link cursor-pointer items-center">
        <button
          className="btn-advanced"
          type="button"
        >
          Options
        </button>
        <IconCaretDown className="caret ml-1" size={14} strokeWidth={2}/>
      </div>
    );
  });

  return (
    <Portal>
      <StyledWrapper>
        <Modal size="md" title="New Request" hideFooter handleCancel={onClose}>
          <form
            className="bruno-form"
            onSubmit={formik.handleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                formik.handleSubmit();
              }
            }}
          >
            <div>
              <label htmlFor="requestName" className="block font-semibold">
                Type
              </label>

              <div className="flex items-center mt-2">
                <input
                  id="http-request"
                  className="cursor-pointer"
                  type="radio"
                  name="requestType"
                  onChange={formik.handleChange}
                  value="http-request"
                  checked={formik.values.requestType === 'http-request'}
                />
                <label htmlFor="http-request" className="ml-1 cursor-pointer select-none">
                  HTTP
                </label>

                <input
                  id="graphql-request"
                  className="ml-4 cursor-pointer"
                  type="radio"
                  name="requestType"
                  onChange={(event) => {
                    formik.setFieldValue('requestMethod', 'POST');
                    formik.handleChange(event);
                  }}
                  value="graphql-request"
                  checked={formik.values.requestType === 'graphql-request'}
                />
                <label htmlFor="graphql-request" className="ml-1 cursor-pointer select-none">
                  GraphQL
                </label>

                <input
                  id="from-curl"
                  className="cursor-pointer ml-auto"
                  type="radio"
                  name="requestType"
                  onChange={formik.handleChange}
                  value="from-curl"
                  checked={formik.values.requestType === 'from-curl'}
                />

                <label htmlFor="from-curl" className="ml-1 cursor-pointer select-none">
                  From cURL
                </label>
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="requestName" className="block font-semibold">
                Request Name
              </label>
              <input
                id="request-name"
                type="text"
                name="requestName"
                placeholder="Request Name"
                ref={inputRef}
                className="block textbox mt-2 w-full"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                onChange={e => {
                  formik.setFieldValue('requestName', e.target.value);
                  !isEditing && formik.setFieldValue('filename', sanitizeName(e.target.value));
                }}
                value={formik.values.requestName || ''}
              />
              {formik.touched.requestName && formik.errors.requestName ? (
                <div className="text-red-500">{formik.errors.requestName}</div>
              ) : null}
            </div>
            {showFilesystemName && (
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="filename" className="flex items-center font-semibold">
                    File Name <small className='font-normal text-muted ml-1'>(on filesystem)</small>
                    <Help width="300">
                      <p>
                        Bruno saves each request as a file in your collection's folder.
                      </p>
                      <p className="mt-2">
                        You can choose a file name different from your request's name or one compatible with filesystem rules.
                      </p>
                    </Help>
                  </label>
                  {isEditing ? (
                    <IconArrowBackUp 
                      className="cursor-pointer opacity-50 hover:opacity-80" 
                      size={16} 
                      strokeWidth={1.5} 
                      onClick={() => toggleEditing(false)} 
                    />
                  ) : (
                    <IconEdit
                      className="cursor-pointer opacity-50 hover:opacity-80" 
                      size={16} 
                      strokeWidth={1.5} 
                      onClick={() => toggleEditing(true)} 
                    />
                  )}
                </div>
                {isEditing ? (
                  <div className='relative flex flex-row gap-1 items-center justify-between'>
                    <input
                      id="file-name"
                      type="text"
                      name="filename"
                      placeholder="File Name"
                      className={`!pr-10 block textbox mt-2 w-full`}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      onChange={formik.handleChange}
                      value={formik.values.filename || ''}
                    />
                    <span className='absolute right-2 top-4 flex justify-center items-center file-extension'>.bru</span>
                  </div>
                ) : (
                  <div className='relative flex flex-row gap-1 items-center justify-between'>
                    <PathDisplay
                      baseName={formik.values.filename? `${formik.values.filename}.bru` : ''}
                    />
                  </div>
                )}
                {formik.touched.filename && formik.errors.filename ? (
                  <div className="text-red-500">{formik.errors.filename}</div>
                ) : null}
              </div>
            )}
            {formik.values.requestType !== 'from-curl' ? (
              <>
                <div className="mt-4">
                  <label htmlFor="request-url" className="block font-semibold">
                    URL
                  </label>
                  <div className="flex items-center mt-2 ">
                    <div className="flex items-center h-full method-selector-container">
                      <HttpMethodSelector
                        method={formik.values.requestMethod}
                        onMethodSelect={(val) => formik.setFieldValue('requestMethod', val)}
                      />
                    </div>
                    <div id="new-request-url" className="flex px-2 items-center flex-grow input-container h-full">
                      <SingleLineEditor
                        onPaste={handlePaste}
                        placeholder="Request URL"
                        value={formik.values.requestUrl || ''}
                        theme={storedTheme}
                        onChange={(value) => {
                          formik.handleChange({
                            target: {
                              name: "requestUrl",
                              value: value
                            }
                          });
                        }}
                        collection={collection}
                        variablesAutocomplete={true}
                      />
                    </div>
                  </div>
                  {formik.touched.requestUrl && formik.errors.requestUrl ? (
                    <div className="text-red-500">{formik.errors.requestUrl}</div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="mt-4">
                <div className="flex justify-between">
                  <label htmlFor="request-url" className="block font-semibold">
                    cURL Command
                  </label>
                  <Dropdown className="dropdown" onCreate={onDropdownCreate} icon={<Icon />} placement="bottom-end">
                    <div
                      className="dropdown-item"
                      onClick={() => {
                        dropdownTippyRef.current.hide();
                        curlRequestTypeChange('http-request');
                      }}
                    >
                      HTTP
                    </div>
                    <div
                      className="dropdown-item"
                      onClick={() => {
                        dropdownTippyRef.current.hide();
                        curlRequestTypeChange('graphql-request');
                      }}
                    >
                      GraphQL
                    </div>
                  </Dropdown>
                </div>
                <textarea
                  name="curlCommand"
                  placeholder="Enter cURL request here.."
                  className="block textbox w-full mt-4 curl-command"
                  value={formik.values.curlCommand}
                  onChange={handleCurlCommandChange}
                ></textarea>
                {formik.touched.curlCommand && formik.errors.curlCommand ? (
                  <div className="text-red-500">{formik.errors.curlCommand}</div>
                ) : null}
              </div>
            )}
            <div className="flex justify-between items-center mt-8 bruno-modal-footer">
              <div className='flex advanced-options'>
                <Dropdown onCreate={onAdvancedDropdownCreate} icon={<AdvancedOptions />} placement="bottom-start">
                  <div 
                    className="dropdown-item"
                    key="show-filesystem-name"
                    onClick={(e) => {
                      advancedDropdownTippyRef.current.hide();
                      toggleShowFilesystemName(!showFilesystemName);
                    }}
                  >
                    {showFilesystemName ? 'Hide Filesystem Name' : 'Show Filesystem Name'}
                  </div>
                </Dropdown>
              </div>
              <div className='flex justify-end'>
                <span className='mr-2'>
                  <button type="button" onClick={onClose} className="btn btn-md btn-close">
                    Cancel
                  </button>
                </span>
                <span>
                  <button
                    type="submit"
                    className="submit btn btn-md btn-secondary"
                  >
                    Create
                  </button>
                </span>
              </div>
            </div>
          </form>
        </Modal>
      </StyledWrapper>
    </Portal>
  );
};

export default NewRequest;
