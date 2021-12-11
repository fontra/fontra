# -*- coding: utf-8 -*-

import json
import aiohttp
import urllib3


urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class Client(object):

    """
    Client to interact with the Robo-CJK back-end.
    Usage:
        c = Client(host, username, password)
        data = c.projects_list()
    """

    @classmethod
    def _if_int(cls, value):
        return value if isinstance(value, int) else None


    @classmethod
    def _if_int_list(cls, values):
        l = [value for value in values if isinstance(value, int)] if values else None
        return json.dumps(l) if l else None


    @classmethod
    def _if_json(cls, value):
        return json.dumps(value) if isinstance(value, dict) else cls._if_str(value)


    @classmethod
    def _if_str(cls, value):
        return value if isinstance(value, str) else None


    @classmethod
    def _if_str_list(cls, values):
        l = [value for value in values if isinstance(value, str)] if values else None
        return json.dumps(l) if l else None


    def __init__(self, host, username, password):
        """
        Initialize a new Robo-CJK API client using the given credentials,
        then authentication is automatically managed by the client, no need to do anything.
        """
        if not host or not any([host.startswith(protocol) for protocol in ['http://', 'https://']]):
            raise ValueError('Invalid host: {}'.format(host))
        if not username:
            raise ValueError('Invalid username: {}'.format(username))
        if not password:
            raise ValueError('Invalid password: {}'.format(password))

        # strip last slash in case
        if host.endswith('/'):
            host = host[:-1]

        self._host = host
        self._username = username
        self._password = password
        self._auth_token = None
        self._connect()

    def _connect(self):
        import requests

        self._session = requests.Session()

        try:
            # check if there are robocjk apis available at the given host
            response = self._api_call('ping')
            assert response['data'] == 'pong'
        except Exception as e:
            # invalid host
            raise ValueError(
                'Unable to call RoboCJK APIs at host: {} - Exception: {}'.format(
                    self._host, e))

        # obtain the auth token to prevent 401 error on first call
        self.auth_token()


    def _api_call(self, view_name, params=None):
        """
        Call an API method by its 'view-name' passing the given params.
        """
        url, data, headers = self._prepare_request(view_name, params)
        # request options
        options = {
            'data': data,
            'headers': headers,
            'timeout': (3.05, 60.0, ),
            'verify': False,
        }
        # send post request
        response = self._session.post(url, **options)
        if response.status_code == 401:
            # unauthorized - request a new auth token
            self.auth_token()
            if self._auth_token:
                # re-send previously unauthorized request
                return self._api_call(view_name, params)
        # read response json data and return dict
        response_data = response.json()
        return response_data


    def _prepare_request(self, view_name, params):
        # get api absolute url
        url = self._api_url(view_name)
        # clean request post data (remove empty entries)
        data = params or {}
        keys = list(data.keys())
        for key in keys:
            val = data.get(key, None)
            if val is None or val == '' or val == [] or val == {}:
                del data[key]
        # build request headers
        headers = {}
        if self._auth_token:
            headers['Authorization'] = 'Bearer {}'.format(self._auth_token)
        headers['Cache-Control'] = 'no-cache'
        headers['Pragma'] = 'no-cache'
        return url, data, headers


    def _api_url(self, view_name):
        """
        Build API absolute url for the given method.
        """
        view_names = {
            # Ping
            'ping': '/api/ping/',

            # Auth (jwt token)
            'auth_token': '/api/auth/token/',

            # Users
            'user_list': '/api/user/list/',
            'user_me': '/api/user/me/',

            # Project
            'project_list': '/api/project/list/',
            'project_get': '/api/project/get/',
            'project_create': '/api/project/create/',

            # Font
            'font_list': '/api/font/list/',
            'font_get': '/api/font/get/',
            'font_create': '/api/font/create/',
            'font_update': '/api/font/update/',

            # Glyphs Composition
            'glyphs_composition_get': '/api/glyphs-composition/get/',
            'glyphs_composition_update': '/api/glyphs-composition/update/',

            # All glif (Atomic Element + Deep Component + Character Glyph)
            'glif_list': '/api/glif/list/',
            'glif_lock': '/api/glif/lock/',
            'glif_unlock': '/api/glif/unlock/',

            # Atomic Element
            'atomic_element_list': '/api/atomic-element/list/',
            'atomic_element_get': '/api/atomic-element/get/',
            'atomic_element_create': '/api/atomic-element/create/',
            'atomic_element_update': '/api/atomic-element/update/',
            'atomic_element_update_status': '/api/atomic-element/update-status/',
            'atomic_element_delete': '/api/atomic-element/delete/',
            'atomic_element_lock': '/api/atomic-element/lock/',
            'atomic_element_unlock': '/api/atomic-element/unlock/',
            'atomic_element_layer_create': '/api/atomic-element/layer/create/',
            'atomic_element_layer_rename': '/api/atomic-element/layer/rename/',
            'atomic_element_layer_update': '/api/atomic-element/layer/update/',
            'atomic_element_layer_delete': '/api/atomic-element/layer/delete/',

            # Deep Component
            'deep_component_list': '/api/deep-component/list/',
            'deep_component_get': '/api/deep-component/get/',
            'deep_component_create': '/api/deep-component/create/',
            'deep_component_update': '/api/deep-component/update/',
            'deep_component_update_status': '/api/deep-component/update-status/',
            'deep_component_delete': '/api/deep-component/delete/',
            'deep_component_lock': '/api/deep-component/lock/',
            'deep_component_unlock': '/api/deep-component/unlock/',

            # Character Glyph
            'character_glyph_list': '/api/character-glyph/list/',
            'character_glyph_get': '/api/character-glyph/get/',
            'character_glyph_create': '/api/character-glyph/create/',
            'character_glyph_update': '/api/character-glyph/update/',
            'character_glyph_update_status': '/api/character-glyph/update-status/',
            'character_glyph_delete': '/api/character-glyph/delete/',
            'character_glyph_lock': '/api/character-glyph/lock/',
            'character_glyph_unlock': '/api/character-glyph/unlock/',
            'character_glyph_layer_create': '/api/character-glyph/layer/create/',
            'character_glyph_layer_rename': '/api/character-glyph/layer/rename/',
            'character_glyph_layer_update': '/api/character-glyph/layer/update/',
            'character_glyph_layer_delete': '/api/character-glyph/layer/delete/',
        }
        url = view_names.get(view_name)
        if not url:
            raise Exception('Invalid url view_name: "{}".'.format(view_name))
        abs_url = '{}{}'.format(self._host, url)
        return abs_url


    def auth_token(self):
        """
        Get an authorization token for the current user.
        """
        params = {
            'username': self._username,
            'password': self._password,
        }
        response = self._api_call('auth_token', params)
        # update auth token
        self._auth_token = response.get('data', {}).get('auth_token', self._auth_token)
        return response


    # def auth_refresh_token(self, token):
    #    # TODO
    #    raise NotImplementedError()


    def user_list(self):
        """
        Get the list of all Users.
        """
        return self._api_call('user_list')


    def user_me(self):
        """
        Get the data of the current User.
        """
        return self._api_call('user_me')


    def project_list(self):
        """
        Get the list of all Projects.
        """
        return self._api_call('project_list')


    def project_get(self, project_uid):
        """
        Get the data of a specific Project.
        """
        params = {
            'project_uid': project_uid,
        }
        return self._api_call('project_get', params)


    def project_create(self, name, repo_url, repo_branch='master'):
        """
        Create a new Project with the specified name and repository url.
        """
        params = {
            'name': name,
            'repo_url': repo_url,
            'repo_branch': repo_branch,
        }
        return self._api_call('project_create', params)


    def font_list(self, project_uid):
        """
        Get the list of all Fonts.
        """
        params = {
            'project_uid': project_uid,
        }
        return self._api_call('font_list', params)


    def font_get(self, font_uid):
        """
        Get the data of a specific Font.
        """
        params = {
            'font_uid': font_uid,
        }
        return self._api_call('font_get', params)


    def font_create(self, project_uid, name, fontlib=None, features=None, designspace=None):
        """
        Create a new Font with the specified project_uid and name.
        Optionally, it is possible to pass also fontlib, features and designspace.
        """
        params = {
            'project_uid': project_uid,
            'name': name,
            'fontlib': self._if_json(fontlib),
            'features': self._if_str(features),
            'designspace': self._if_json(designspace),
        }
        return self._api_call('font_create', params)


    def font_update(self, font_uid, fontlib=None, features=None, designspace=None):
        """
        Update the fontlib and/or features and/or designspace of a specific Font.
        """
        params = {
            'font_uid': font_uid,
            'fontlib': self._if_json(fontlib),
            'features': self._if_str(features),
            'designspace': self._if_json(designspace),
        }
        return self._api_call('font_update', params)


    def glyphs_composition_get(self, font_uid):
        """
        Get the glyphs-composition data of a specific Font.
        """
        params = {
            'font_uid': font_uid,
        }
        return self._api_call('glyphs_composition_get', params)


    def glyphs_composition_update(self, font_uid, data):
        """
        Update the glyphs-composition of a specific Font.
        """
        params = {
            'font_uid': font_uid,
            'data': self._if_json(data),
        }
        return self._api_call('glyphs_composition_update', params)


    def glif_list(self,
            font_uid, status=None,
            updated_by_current_user=None, updated_by=None,
            is_locked_by_current_user=None, is_locked_by=None, is_locked=None, is_empty=None,
            has_variation_axis=None, has_outlines=None, has_components=None, has_unicode=None):
        """
        Get the lists of Atomic Elements / Deep Components / Character Glyphs of a Font according to the given filters.
        """
        params = {
            'font_uid': font_uid,
            'status': status,
            'updated_by_current_user': updated_by_current_user,
            'updated_by': updated_by,
            'is_locked_by_current_user': is_locked_by_current_user,
            'is_locked_by': is_locked_by,
            'is_locked': is_locked,
            'is_empty': is_empty,
            'has_variation_axis': has_variation_axis,
            'has_outlines': has_outlines,
            'has_components': has_components,
            'has_unicode': has_unicode,
        }
        return self._api_call('glif_list', params)


    def glif_lock(self, font_uid, atomic_elements=None, deep_components=None, character_glyphs=None, return_layers=False, return_related=False):
        """
        Lock lists of Atomic Elements / Deep Components / Character Glyphs of a Font by their id or name.
        """
        params = {
            'font_uid': font_uid,
            'character_glyphs_ids': self._if_int_list(character_glyphs),
            'character_glyphs_names': self._if_str_list(character_glyphs),
            'deep_components_ids': self._if_int_list(deep_components),
            'deep_components_names': self._if_str_list(deep_components),
            'atomic_elements_ids': self._if_int_list(atomic_elements),
            'atomic_elements_names': self._if_str_list(atomic_elements),
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('glif_lock', params)


    def glif_unlock(self, font_uid, atomic_elements=None, deep_components=None, character_glyphs=None, return_layers=False, return_related=False):
        """
        Unlock lists of Atomic Elements / Deep Components / Character Glyphs of a Font by their id or name.
        """
        params = {
            'font_uid': font_uid,
            'character_glyphs_ids': self._if_int_list(character_glyphs),
            'character_glyphs_names': self._if_str_list(character_glyphs),
            'deep_components_ids': self._if_int_list(deep_components),
            'deep_components_names': self._if_str_list(deep_components),
            'atomic_elements_ids': self._if_int_list(atomic_elements),
            'atomic_elements_names': self._if_str_list(atomic_elements),
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('glif_unlock', params)


    def atomic_element_list(self,
            font_uid, status=None,
            updated_by_current_user=None, updated_by=None,
            is_locked_by_current_user=None, is_locked_by=None, is_locked=None, is_empty=None,
            has_variation_axis=None, has_outlines=None, has_components=None, has_unicode=None):
        """
        Get the list of Atomic Elements of a Font according to the given filters.
        """
        params = {
            'font_uid': font_uid,
            'status': status,
            'updated_by_current_user': updated_by_current_user,
            'updated_by': updated_by,
            'is_locked_by_current_user': is_locked_by_current_user,
            'is_locked_by': is_locked_by,
            'is_locked': is_locked,
            'is_empty': is_empty,
            'has_variation_axis': has_variation_axis,
            'has_outlines': has_outlines,
            'has_components': has_components,
            'has_unicode': has_unicode,
        }
        return self._api_call('atomic_element_list', params)


    def atomic_element_get(self, font_uid, atomic_element_id, return_layers=True, return_related=True):
        """
        Get the data of an Atomic Element.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(atomic_element_id),
            'name': self._if_str(atomic_element_id),
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('atomic_element_get', params)


    def atomic_element_create(self, font_uid, atomic_element_data, return_layers=False, return_related=False):
        """
        Create a new Atomic Element with the specified glif data.
        """
        params = {
            'font_uid': font_uid,
            'data': atomic_element_data,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('atomic_element_create', params)


    def atomic_element_update(self, font_uid, atomic_element_id, atomic_element_data, ignore_lock=False, return_layers=False, return_related=False):
        """
        Update the glif data of an Atomic Element.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(atomic_element_id),
            'name': self._if_str(atomic_element_id),
            'data': atomic_element_data,
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('atomic_element_update', params)


    def atomic_element_update_status(self, font_uid, atomic_element_id, atomic_element_status, ignore_lock=False, return_layers=False, return_related=False):
        """
        Update the status of an Atomic Element.
        Status value must be one of the following: 'todo', 'wip', 'checking-1', 'checking-2', 'checking-3', 'done'.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(atomic_element_id),
            'name': self._if_str(atomic_element_id),
            'status': atomic_element_status,
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('atomic_element_update_status', params)


    def atomic_element_delete(self, font_uid, atomic_element_id, ignore_lock=False):
        """
        Delete an Atomic Element (and all its layers).
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(atomic_element_id),
            'name': self._if_str(atomic_element_id),
            'ignore_lock': ignore_lock,
        }
        return self._api_call('atomic_element_delete', params)


    def atomic_element_lock(self, font_uid, atomic_element_id, return_layers=False, return_related=False):
        """
        Lock an Atomic Element by the current user.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(atomic_element_id),
            'name': self._if_str(atomic_element_id),
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('atomic_element_lock', params)


    def atomic_element_unlock(self, font_uid, atomic_element_id, return_layers=False, return_related=False):
        """
        Unlock an Atomic Element by the current user.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(atomic_element_id),
            'name': self._if_str(atomic_element_id),
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('atomic_element_unlock', params)


    def atomic_element_layer_create(self, font_uid, atomic_element_id, layer_name, layer_data, ignore_lock=False, return_layers=True, return_related=False):
        """
        Create a new Atomic Element Layer with the provided layer glif data.
        """
        params = {
            'font_uid': font_uid,
            'atomic_element_id': self._if_int(atomic_element_id),
            'atomic_element_name': self._if_str(atomic_element_id),
            'group_name': layer_name,
            'data': layer_data,
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('atomic_element_layer_create', params)


    def atomic_element_layer_rename(self, font_uid, atomic_element_id, layer_id, layer_new_name, ignore_lock=False, return_layers=True, return_related=False):
        """
        Rename an Atomic Element Layer with a new name.
        """
        params = {
            'font_uid': font_uid,
            'atomic_element_id': self._if_int(atomic_element_id),
            'atomic_element_name': self._if_str(atomic_element_id),
            'id': self._if_int(layer_id),
            'group_name': self._if_str(layer_id),
            'new_group_name': layer_new_name,
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('atomic_element_layer_rename', params)


    def atomic_element_layer_update(self, font_uid, atomic_element_id, layer_id, layer_data, ignore_lock=False, return_layers=True, return_related=False):
        """
        Update an Atomic Element Layer glif data.
        """
        params = {
            'font_uid': font_uid,
            'atomic_element_id': self._if_int(atomic_element_id),
            'atomic_element_name': self._if_str(atomic_element_id),
            'id': self._if_int(layer_id),
            'group_name': self._if_str(layer_id),
            'data': layer_data,
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('atomic_element_layer_update', params)


    def atomic_element_layer_delete(self, font_uid, atomic_element_id, layer_id, ignore_lock=False, return_layers=True, return_related=False):
        """
        Delete an Atomic Element Layer.
        """
        params = {
            'font_uid': font_uid,
            'atomic_element_id': self._if_int(atomic_element_id),
            'atomic_element_name': self._if_str(atomic_element_id),
            'id': self._if_int(layer_id),
            'group_name': self._if_str(layer_id),
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('atomic_element_layer_delete', params)


    def deep_component_list(self,
            font_uid, status=None,
            updated_by_current_user=None, updated_by=None,
            is_locked_by_current_user=None, is_locked_by=None, is_locked=None, is_empty=None,
            has_variation_axis=None, has_outlines=None, has_components=None, has_unicode=None):
        """
        Get the list of Deep Components of a Font according to the given filters.
        """
        params = {
            'font_uid': font_uid,
            'status': status,
            'updated_by_current_user': updated_by_current_user,
            'updated_by': updated_by,
            'is_locked_by_current_user': is_locked_by_current_user,
            'is_locked_by': is_locked_by,
            'is_locked': is_locked,
            'is_empty': is_empty,
            'has_variation_axis': has_variation_axis,
            'has_outlines': has_outlines,
            'has_components': has_components,
            'has_unicode': has_unicode,
        }
        return self._api_call('deep_component_list', params)


    def deep_component_get(self, font_uid, deep_component_id, return_layers=True, return_related=True):
        """
        Get the data of a Deep Component.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(deep_component_id),
            'name': self._if_str(deep_component_id),
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('deep_component_get', params)


    def deep_component_create(self, font_uid, deep_component_data, return_layers=False, return_related=False):
        """
        Create a new Deep Component with the specified glif data.
        """
        params = {
            'font_uid': font_uid,
            'data': deep_component_data,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('deep_component_create', params)


    def deep_component_update(self, font_uid, deep_component_id, deep_component_data, ignore_lock=False, return_layers=False, return_related=False):
        """
        Update the data of a Deep Component.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(deep_component_id),
            'name': self._if_str(deep_component_id),
            'data': deep_component_data,
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('deep_component_update', params)


    def deep_component_update_status(self, font_uid, deep_component_id, deep_component_status, ignore_lock=False, return_layers=False, return_related=False):
        """
        Update the status of a Deep Component.
        Status value must be one of the following: 'todo', 'wip', 'checking-1', 'checking-2', 'checking-3', 'done'.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(deep_component_id),
            'name': self._if_str(deep_component_id),
            'status': deep_component_status,
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('deep_component_update_status', params)


    def deep_component_delete(self, font_uid, deep_component_id, ignore_lock=False, return_layers=False, return_related=False):
        """
        Delete a Deep Component.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(deep_component_id),
            'name': self._if_str(deep_component_id),
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('deep_component_delete', params)


    def deep_component_lock(self, font_uid, deep_component_id, return_layers=False, return_related=False):
        """
        Lock a Deep Component by the current user.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(deep_component_id),
            'name': self._if_str(deep_component_id),
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('deep_component_lock', params)


    def deep_component_unlock(self, font_uid, deep_component_id, return_layers=False, return_related=False):
        """
        Unlock a Deep Component by the current user.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(deep_component_id),
            'name': self._if_str(deep_component_id),
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('deep_component_unlock', params)


    def character_glyph_list(self,
            font_uid, status=None,
            updated_by_current_user=None, updated_by=None,
            is_locked_by_current_user=None, is_locked_by=None, is_locked=None, is_empty=None,
            has_variation_axis=None, has_outlines=None, has_components=None, has_unicode=None):
        """
        Get the list of Character Glyphs of a Font according to the given filters.
        """
        params = {
            'font_uid': font_uid,
            'status': status,
            'updated_by_current_user': updated_by_current_user,
            'updated_by': updated_by,
            'is_locked_by_current_user': is_locked_by_current_user,
            'is_locked_by': is_locked_by,
            'is_locked': is_locked,
            'is_empty': is_empty,
            'has_variation_axis': has_variation_axis,
            'has_outlines': has_outlines,
            'has_components': has_components,
            'has_unicode': has_unicode,
        }
        return self._api_call('character_glyph_list', params)


    def character_glyph_get(self, font_uid, character_glyph_id, return_layers=True, return_related=True):
        """
        Get the data of a Character Glyph.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(character_glyph_id),
            'name': self._if_str(character_glyph_id),
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('character_glyph_get', params)


    def character_glyph_create(self, font_uid, character_glyph_data, return_layers=False, return_related=False):
        """
        Create a new Character Glyph with the specified glif data.
        """
        params = {
            'font_uid': font_uid,
            'data': character_glyph_data,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('character_glyph_create', params)


    def character_glyph_update(self, font_uid, character_glyph_id, character_glyph_data, ignore_lock=False, return_layers=False, return_related=False):
        """
        Update the data of a Character Glyph.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(character_glyph_id),
            'name': self._if_str(character_glyph_id),
            'data': character_glyph_data,
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('character_glyph_update', params)


    def character_glyph_update_status(self, font_uid, character_glyph_id, character_glyph_status, ignore_lock=False, return_layers=False, return_related=False):
        """
        Update the status of a Character Glyph.
        Status value must be one of the following: 'todo', 'wip', 'checking-1', 'checking-2', 'checking-3', 'done'.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(character_glyph_id),
            'name': self._if_str(character_glyph_id),
            'status': character_glyph_status,
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('character_glyph_update_status', params)


    def character_glyph_delete(self, font_uid, character_glyph_id, ignore_lock=False, return_layers=False, return_related=False):
        """
        Delete a Character Glyph (and all its layers).
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(character_glyph_id),
            'name': self._if_str(character_glyph_id),
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('character_glyph_delete', params)


    def character_glyph_lock(self, font_uid, character_glyph_id, return_layers=False, return_related=False):
        """
        Lock a Character Glyph by the current user.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(character_glyph_id),
            'name': self._if_str(character_glyph_id),
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('character_glyph_lock', params)


    def character_glyph_unlock(self, font_uid, character_glyph_id, return_layers=False, return_related=False):
        """
        Unlock a Character Glyph by the current user.
        """
        params = {
            'font_uid': font_uid,
            'id': self._if_int(character_glyph_id),
            'name': self._if_str(character_glyph_id),
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('character_glyph_unlock', params)


    def character_glyph_layer_create(self, font_uid, character_glyph_id, layer_name, layer_data, ignore_lock=False, return_layers=True, return_related=False):
        """
        Create a new Character Glyph Layer with the provided layer glif data.
        """
        params = {
            'font_uid': font_uid,
            'character_glyph_id': self._if_int(character_glyph_id),
            'character_glyph_name': self._if_str(character_glyph_id),
            'group_name': layer_name,
            'data': layer_data,
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('character_glyph_layer_create', params)


    def character_glyph_layer_rename(self, font_uid, character_glyph_id, layer_id, layer_new_name, ignore_lock=False, return_layers=True, return_related=False):
        """
        Rename a Character Glyph Layer with a new name.
        """
        params = {
            'font_uid': font_uid,
            'character_glyph_id': self._if_int(character_glyph_id),
            'character_glyph_name': self._if_str(character_glyph_id),
            'id': self._if_int(layer_id),
            'group_name': self._if_str(layer_id),
            'new_group_name': layer_new_name,
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('character_glyph_layer_rename', params)


    def character_glyph_layer_update(self, font_uid, character_glyph_id, layer_id, layer_data, ignore_lock=False, return_layers=True, return_related=False):
        """
        Update a Character Glyph Layer glif data.
        """
        params = {
            'font_uid': font_uid,
            'character_glyph_id': self._if_int(character_glyph_id),
            'character_glyph_name': self._if_str(character_glyph_id),
            'id': self._if_int(layer_id),
            'group_name': self._if_str(layer_id),
            'data': layer_data,
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('character_glyph_layer_update', params)


    def character_glyph_layer_delete(self, font_uid, character_glyph_id, layer_id, ignore_lock=False, return_layers=True, return_related=False):
        """
        Delete a Character Glyph Layer.
        """
        params = {
            'font_uid': font_uid,
            'character_glyph_id': self._if_int(character_glyph_id),
            'character_glyph_name': self._if_str(character_glyph_id),
            'id': self._if_int(layer_id),
            'group_name': self._if_str(layer_id),
            'ignore_lock': ignore_lock,
            'return_layers': return_layers,
            'return_related': return_related,
        }
        return self._api_call('character_glyph_layer_delete', params)

