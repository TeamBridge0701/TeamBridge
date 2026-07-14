package com.groupware.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.groupware.dto.EmployeeDTO;

@Mapper
public interface EmployeeMapper {
	
	// 로그인 인증용 - CustomUserDetailsService.loadUserByUsername()에서
	// 입력한 사번(EMPLOYEE_NO)으로 EMPLOYEE 조회
	EmployeeDTO findByEmployeeNo(String employeeNo);
	
	// 마이페이지 조회
	// @Param - xml에서 #{employeeId} 사용하여 붙임
	EmployeeDTO findMyPageInfo(@Param("employeeId") int employeeId);
}
