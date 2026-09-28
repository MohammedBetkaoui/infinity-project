// University academic structure (Faculty -> Department) for the Infinity
// Club membership form. Shared by the Join page (options, client-side
// validation, summary labels), api/join.js (authoritative validation) and
// the admin views (display labels). Pure: no React, window, document,
// Supabase, process.env or network.
//
// The `value` slugs are what gets stored (membership_applications.faculty /
// .department); labels are resolved at display time. The same pairs are
// enforced in the database by public.membership_department_label() (see
// supabase/migrations/20261008120000_membership_faculty_department.sql) —
// tests/membership-academic-structure.test.mjs fails if the two drift apart.
//
// `department` here is the student's university department. It is unrelated
// to `staffDepartment` (the Infinity Club internal team).

const faculty = (value, label, departments) => Object.freeze({
  value,
  label,
  departments: Object.freeze(departments.map(([departmentValue, departmentLabel]) => Object.freeze({
    value: departmentValue,
    label: departmentLabel,
  }))),
})

export const UNIVERSITY_FACULTIES = Object.freeze([
  faculty('fmi', 'Faculty of Mathematics and Computer Science', [
    ['computer-science', 'Computer Science'],
    ['mathematics', 'Mathematics'],
  ]),
  faculty('fst', 'Faculty of Science and Technology', [
    ['automatic-control', 'Automatic Control'],
    ['electromechanics', 'Electromechanics'],
    ['electronics', 'Electronics'],
    ['electrical-engineering', 'Electrical Engineering'],
    ['civil-engineering', 'Civil Engineering'],
    ['mechanical-engineering', 'Mechanical Engineering'],
    ['process-engineering', 'Process Engineering'],
    ['telecommunications', 'Telecommunications'],
  ]),
  faculty('fsnv', 'Faculty of Natural and Life Sciences, Earth and Universe Sciences', [
    ['biology', 'Biology'],
    ['agronomy', 'Agronomy'],
    ['ecology-environment', 'Ecology and Environment'],
    ['nutrition', 'Nutrition Sciences'],
  ]),
  faculty('fsecg', 'Faculty of Economic, Commercial and Management Sciences', [
    ['economic-sciences', 'Economic Sciences'],
    ['management-sciences', 'Management Sciences'],
    ['commercial-sciences', 'Commercial Sciences'],
    ['finance-accounting', 'Financial and Accounting Sciences'],
  ]),
  faculty('fll', 'Faculty of Letters and Languages', [
    ['arabic', 'Arabic Language and Literature'],
    ['french', 'French Language'],
    ['english', 'English Language'],
  ]),
  faculty('fdsp', 'Faculty of Law and Political Science', [
    ['law', 'Law'],
    ['political-science', 'Political Science'],
  ]),
  faculty('fshs', 'Faculty of Social and Human Sciences', [
    ['psychology', 'Psychology'],
    ['sociology', 'Sociology'],
  ]),
])

// Exact string matches against the lists above, never object-key lookups, so
// a crafted value such as "__proto__" or "constructor" can never resolve.
const findFaculty = (facultyValue) => (
  typeof facultyValue === 'string'
    ? UNIVERSITY_FACULTIES.find((item) => item.value === facultyValue) || null
    : null
)

const findDepartment = (facultyValue, departmentValue) => (
  typeof departmentValue === 'string'
    ? findFaculty(facultyValue)?.departments.find((item) => item.value === departmentValue) || null
    : null
)

export const getFacultyDepartments = (facultyValue) => findFaculty(facultyValue)?.departments || []

export const isValidFaculty = (facultyValue) => Boolean(findFaculty(facultyValue))

// A department is only valid inside its own faculty: ('fmi', 'civil-engineering') is refused.
export const isValidDepartmentForFaculty = (facultyValue, departmentValue) => Boolean(findDepartment(facultyValue, departmentValue))

export const getFacultyLabel = (facultyValue) => findFaculty(facultyValue)?.label || ''

export const getDepartmentLabel = (facultyValue, departmentValue) => findDepartment(facultyValue, departmentValue)?.label || ''

// Readable department for any stored application or profile: the label of a
// structured (faculty, department) pair, or the free text of a legacy row
// written before faculties existed (faculty is null there).
export const describeAcademicDepartment = (facultyValue, departmentValue) => (
  getDepartmentLabel(facultyValue, departmentValue) || (typeof departmentValue === 'string' ? departmentValue.trim() : '')
)
