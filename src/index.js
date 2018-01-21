import React, { Component } from 'react'
import {
  node,
  object,
  func,
} from 'prop-types'

import {
  ap,
  assoc,
  complement,
  defaultTo,
  equals,
  is,
  isNil,
  lensPath,
  map,
  mergeAll,
  not,
  partial,
  partialRight,
  pipe,
  reduce,
  reject,
  set,
  view,
  when,
} from 'ramda'


const mergeRecursive = pairs => pipe(
  mergeAll,
  map(when(is(Array), mergeRecursive))
)(pairs)

const defaultToEmptyString = defaultTo('')

export default class Form extends Component {
  constructor (props) {
    super(props)

    this.state = {
      errors: {},
      data: props.data || {},
    }

    this.cloneTree = this.cloneTree.bind(this)
    this.validateTree = this.validateTree.bind(this)
    this.notifyChangeEvent = this.notifyChangeEvent.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  componentWillMount () {
    if (this.props.data) {
      this.setState({
        errors: this.validateTree({}, this),
      })
    }
  }

  componentWillReceiveProps (nextProps) {
    const { data } = nextProps

    if (data && !equals(data, this.props.data)) {
      const errors = this.validateTree(this.state.errors, this)
      this.setState({ data, errors })
    }
  }

  notifyChangeEvent () {
    const { onChange } = this.props

    if (typeof onChange === 'function') {
      const { data, errors } = this.state
      onChange(data, errors)
    }
  }

  handleChange (path, event) {
    const lens = lensPath(path)
    const value = event.target.value

    const data = set(lens, value, this.state.data)
    const validate = view(lens, this.props.validation)

    if (!validate) {
      this.setState({ data }, this.notifyChangeEvent)
      return
    }

    if (validate.constructor === Array) {
      const validationErrors = reject(
        complement(Boolean),
        ap(validate, [value])
      )

      if (validationErrors.length > 0) {
        const validation = validationErrors[0]
        const errors = set(lens, validation, this.state.errors)

        this.setState({ data, errors }, this.notifyChangeEvent)
        return
      }

      const errors = set(lens, null, this.state.errors)

      this.setState({ data, errors }, this.notifyChangeEvent)
      return
    }

    const validation = validate(
      defaultToEmptyString(view(lens, data))
    )

    const errors = set(lens, validation, this.state.errors)

    this.setState({ data, errors }, this.notifyChangeEvent)
  }

  cloneTree (element, index, parentPath = []) {
    if (typeof element === 'string') {
      return element
    }

    if (element.props.role === 'alert' && element.props.htmlFor) {
      const path = [...parentPath, element.props.htmlFor]
      const lens = lensPath(path)

      const errors = view(lens, this.state.errors)

      if (errors) {
        const error = is(Array, errors) ? errors[0] : errors

        return React.cloneElement(
          element,
          { children: error }
        )
      }

      return element
    }

    const name = not(isNil(element.props.name)) ? [element.props.name] : []
    const path = [...parentPath, ...name]
    const lens = lensPath(path)

    if (element.props.children) {
      return React.cloneElement(element, {
        children: React.Children.map(
          element.props.children,
          partialRight(this.cloneTree, [[...parentPath, ...name]])
        ),
      })
    }

    if (name.length > 0) {
      return React.cloneElement(element, {
        error: view(lens, this.state.errors),
        value: defaultToEmptyString(view(lens, this.state.data)),
        onChange: partial(this.handleChange, [path]),
      })
    }

    return element
  }

  validateTree (errors, element, parentPath = []) {
    if (typeof element === 'string') {
      return errors
    }

    if (!element.props) {
      return errors
    }

    if (is(Array, element.props.children)) {
      const { children } = element.props
      const path = element.props.name
        ? [...parentPath, element.props.name]
        : parentPath

      const validated = reduce(
        partialRight(this.validateTree, [path]),
        {},
        children
      )

      if (path.length > 0) {
        return assoc(
          element.props.name,
          validated,
          errors
        )
      }

      return validated
    }

    if (element.props.name) {
      const path = [...parentPath, element.props.name]
      const lens = lensPath(path)
      const validation = view(lens, this.props.validation)

      if (!validation) {
        return errors
      }

      const value = defaultTo('', view(lens, this.state.data))

      if (is(Array, validation)) {
        const validationErrors = reject(
          complement(Boolean),
          ap(validation, [value])
        )

        if (validationErrors.length > 0) {
          const error = validationErrors[0]

          return assoc(
            element.props.name,
            error,
            errors
          )
        }

        return errors
      }

      const validationError = validation(value)

      if (!validationError) {
        return errors
      }

      return assoc(
        element.props.name,
        validationError,
        errors
      )
    }

    return errors
  }

  handleSubmit (event) {
    event.preventDefault()
    event.stopPropagation()

    const errors = this.validateTree(
      this.state.errors,
      this
    )

    this.setState({ errors })

    this.props.onSubmit(this.state.data)
  }

  render () {
    return (
      <form onSubmit={this.handleSubmit}>
        {React.Children.map(
          this.props.children,
          this.cloneTree
        )}
      </form>
    )
  }
}

Form.propTypes = {
  /**
   * The children can contain any kind of component. Inputs with name
   * property will be tracked for changes using `onChange` callback.
   * Sibling labels with `role=alert` and `htmlFor` pointing to a validated
   * component will be used to present the error message.
  **/
  children: node,
  /**
   * The validation object whose keys mirror form field structure.
   * Values of this object can be either functions or a function array.
   * Validation functions receives the input string and should return
   * a string message on error and a falsy value otherwise.
  **/
  validation: object, // eslint-disable-line
  /**
   * The form submit callback. Receives the serialized form as an object.
  **/
  onSubmit: func,
  /**
   * The form change callback. This callback runs on every form control's
   * `onChange`, right after validations. When this is defined, the form
   * behaves as a controlled component, and the user is responsible for
   * updating the form state via `data` prop.
  **/
  /**
   * @callback onChange
   * @param {object} data
   * @param {object} errors
  **/
  onChange: func,
  /**
   * The form data object whose keys mirror form field structure.
   * Setting this prop will set the form controls' values accordingly.
   * This can be used for rendering an initial state or to use the form
   * as a controlled component.
  **/
  data: object, // eslint-disable-line
}

Form.defaultProps = {
  children: null,
  data: null,
  onChange: null,
  onSubmit: () => undefined,
  validation: {},
}
