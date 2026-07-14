package com.groupware.mapper;


import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.groupware.dto.DepartmentDTO;
import com.groupware.dto.EmployeeDTO;

@Mapper
public interface EmployeeMapper {
	
	// 로그인 인증용 - CustomUserDetailsService.loadUserByUsername()에서
	// 입력한 사번(EMPLOYEE_NO)으로 EMPLOYEE 조회
	EmployeeDTO findByEmployeeNo(String employeeNo);
	
	// 마이페이지 조회
	// @Param - xml에서 #{employeeId} 사용하여 붙임
	EmployeeDTO findMyPageInfo(@Param("employeeId") int employeeId);
	
	// 조직도 왼쪽 트리에 표시할 모든 부서를 조회한다.
	List<DepartmentDTO> findDepartments();

	// 부서 필터에 맞는 ACTIVE 직원만 조직도 표에 표시한다. deptId가 null 이면 전체다.
	List<EmployeeDTO> findActiveEmployeesByDepartment(@Param("deptId") Integer deptId);

	// 상세 모달에서 사용할 ACTIVE 직원 한 명을 조회한다. */
	EmployeeDTO findActiveEmployeeById(int employeeId);
}
