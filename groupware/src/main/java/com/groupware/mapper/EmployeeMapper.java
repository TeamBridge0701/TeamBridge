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

	
	
	
	// 마이페이지 비밀번호 변경
	// newPassword는 Service에서 이미 BCrypt로 해싱된 값 - 여기선 그대로 저장만 함
	int updatePassword(@Param("employeeId") int employeeId, @Param("newPassword") String newPassword);

	// 마이페이지 전화번호/이메일 수정 (프로필 사진은 경로 협의 후 별도 추가 예정)
	int updateContact(@Param("employeeId") int employeeId, @Param("employeePhone") String employeePhone,
			@Param("employeeEmail") String employeeEmail);

	// 관리자: 계정 목록 조회 - keyword는 이름 검색어(없으면 전체)
	List<EmployeeDTO> findAll(@Param("keyword") String keyword);

	// 관리자: 신규 사원 등록 - employeeNo/employeePwd는 Service에서 채번·해싱까지 끝낸 값
	int insert(EmployeeDTO employeeDTO);

	// 관리자: 인사정보 수정 (이름/부서/직급/연락처)
	int updateInfo(EmployeeDTO employeeDTO);

	// 관리자: 재직 상태 변경 (ACTIVE / SUSPENDED)
	int updateStatus(@Param("employeeId") int employeeId, @Param("employeeStatus") String employeeStatus);

	// 관리자: 신규 등록 시 사번 채번용 - 해당 연도(year, 4자리) + 순번(3자리) 형식 중
	// 이미 존재하는 것 중 가장 큰 값을 조회 (없으면 null). "___"는 순번 3자리 자리표시.
	String findMaxEmployeeNoByYear(@Param("year") String year);
}
